import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import pkg from '../package.json' with {type: 'json'};
import {CallToolResult, Implementation} from '@modelcontextprotocol/sdk/types.js';
import {Chain} from 'viem';
import {ServerOptions} from '@modelcontextprotocol/sdk/server';
import {createServer as createMCPEthereumServer} from 'mcp-ethereum';
import {getClients} from 'mcp-ethereum/helpers';
import {createContractClients} from './contracts/clients.js';
import {createSpaceInfo} from './contracts/space-info.js';
import {JsonFleetStorage} from './storage/json-storage.js';
import {FleetManager} from './fleet/manager.js';
import {PlanetManager} from './planet/manager.js';
import {createAcquirePlanetsTool} from './tools/acquire-planets.js';
import {createSendFleetTool} from './tools/send-fleet.js';
import {createResolveFleetTool} from './tools/resolve-fleet.js';
import {createExitPlanetsTool} from './tools/exit-planets.js';
import {createGetPendingExitsTool} from './tools/get-pending-exits.js';
import {createVerifyExitStatusTool} from './tools/verify-exit-status.js';
import {createGetMyPlanetsTool} from './tools/get-my-planets.js';
import {createGetPlanetsAroundTool} from './tools/get-planets-around.js';
import {createGetPendingFleetsTool} from './tools/get-pending-fleets.js';

// Helper function to handle BigInt serialization in JSON.stringify
function stringifyWithBigInt(obj: any, space?: number): string {
	return JSON.stringify(
		obj,
		(_key, value) => (typeof value === 'bigint' ? value.toString() : value),
		space,
	);
}

export function createServer(
	params: {chain: Chain; privateKey?: `0x${string}`; gameContract: `0x${string}`},
	options?: {
		ethereum?: boolean;
		rpcURL?: string;
		serverOptions?: ServerOptions;
		serverInfo?: Implementation;
		storageConfig?: {type: 'json' | 'sqlite'; dataDir?: string};
	},
) {
	const {gameContract, ...mcpEthereumParams} = params;
	const {publicClient, walletClient} = getClients(params, options);

	const name = `${pkg.name}-server`;
	const server = options?.ethereum
		? createMCPEthereumServer(mcpEthereumParams, {
				...options,
				serverInfo: {name, version: pkg.version, ...options?.serverInfo},
			})
		: new McpServer(
				options?.serverInfo || {
					name,
					version: pkg.version,
				},
				options?.serverOptions || {capabilities: {logging: {}}},
			);

	// Initialize contract clients
	const contractClients = createContractClients(
		params.chain,
		options?.rpcURL || params.chain.rpcUrls.default.http[0],
		gameContract,
		params.privateKey,
	);

	// Initialize SpaceInfo
	let spaceInfo;
	let contractConfig;
	(async () => {
		const result = await createSpaceInfo(
			contractClients.publicClient,
			contractClients.infoContract.address as `0x${string}`,
			contractClients.infoContract.abi,
		);
		spaceInfo = result.spaceInfo;
		contractConfig = result.contractConfig;
	})();

	// Initialize storage
	const storageConfig = options?.storageConfig || {type: 'json', dataDir: './data'};
	const storage = new JsonFleetStorage(storageConfig.dataDir || './data');

	// Initialize managers (will be initialized after spaceInfo is ready)
	let fleetManager: FleetManager | null = null;
	let planetManager: PlanetManager | null = null;

	// Helper to ensure managers are initialized
	const ensureManagersInitialized = async () => {
		if (!spaceInfo || !contractConfig) {
			const result = await createSpaceInfo(
				contractClients.publicClient,
				contractClients.infoContract.address as `0x${string}`,
				contractClients.infoContract.abi,
			);
			spaceInfo = result.spaceInfo;
			contractConfig = result.contractConfig;
		}

		if (!fleetManager && walletClient) {
			fleetManager = new FleetManager(
				walletClient,
				contractClients.fleetsCommitContract,
				contractClients.fleetsRevealContract,
				spaceInfo,
				contractConfig,
				storage,
				gameContract,
			);
		}

		if (!planetManager && walletClient) {
			planetManager = new PlanetManager(
				walletClient,
				contractClients.stakingContract,
				contractClients.infoContract,
				spaceInfo,
				contractConfig,
				storage,
			);
		}
	};

	// Register acquire_planets tool
	server.registerTool(
		'acquire_planets',
		{
			description:
				'Acquire (stake) multiple planets in the Conquest game. This allows you to take ownership of unclaimed planets.',
			inputSchema: {
				type: 'object',
				properties: {
					planetIds: {
						type: 'array',
						items: {
							oneOf: [{type: 'string'}, {type: 'number'}],
						},
						description: 'Array of planet location IDs to acquire (as hex strings or numbers)',
					},
					amountToMint: {
						type: 'number',
						description: 'Amount of native token to spend to acquire the planets',
					},
					tokenAmount: {
						type: 'number',
						description: 'Amount of staking token to spend to acquire the planets',
					},
				},
				required: ['planetIds', 'amountToMint', 'tokenAmount'],
			},
		},
		async (args, extra): Promise<CallToolResult> => {
			try {
				await ensureManagersInitialized();
				if (!planetManager) {
					throw new Error('Planet manager not initialized');
				}

				// Parse arguments
				const parsed = args as any;
				const tool = createAcquirePlanetsTool(planetManager);
				return await tool.execute(parsed);
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: stringifyWithBigInt(
								{
									error: error instanceof Error ? error.message : String(error),
								},
								2,
							),
						},
					],
					isError: true,
				};
			}
		},
	);

	// Register send_fleet tool
	server.registerTool(
		'send_fleet',
		{
			description:
				'Send a fleet from one planet to another in the Conquest game. The fleet will travel through space and can be resolved after arrival.',
			inputSchema: {
				type: 'object',
				properties: {
					fromPlanetId: {
						oneOf: [{type: 'string'}, {type: 'number'}],
						description: 'Source planet location ID (as hex string or number)',
					},
					toPlanetId: {
						oneOf: [{type: 'string'}, {type: 'number'}],
						description: 'Destination planet location ID (as hex string or number)',
					},
					quantity: {
						type: 'number',
						description: 'Number of spaceships to send',
					},
					arrivalTimeWanted: {
						type: 'number',
						description:
							'Desired arrival time (timestamp in seconds). If not specified, will be calculated based on distance.',
					},
					gift: {
						type: 'boolean',
						description: 'Whether the fleet is a gift (sent without requiring arrival)',
						default: false,
					},
					specific: {
						type: 'string',
						description: 'Additional specific data for the fleet',
						default: '0x',
					},
				},
				required: ['fromPlanetId', 'toPlanetId', 'quantity'],
			},
		},
		async (args, extra): Promise<CallToolResult> => {
			try {
				await ensureManagersInitialized();
				if (!fleetManager) {
					throw new Error('Fleet manager not initialized');
				}

				const parsed = args as any;
				const tool = createSendFleetTool(fleetManager);
				return await tool.execute(parsed);
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: stringifyWithBigInt(
								{
									error: error instanceof Error ? error.message : String(error),
								},
								2,
							),
						},
					],
					isError: true,
				};
			}
		},
	);

	// Register resolve_fleet tool
	server.registerTool(
		'resolve_fleet',
		{
			description:
				'Resolve a previously sent fleet. This must be called after the fleet arrival time + resolve window to reveal the destination and secret.',
			inputSchema: {
				type: 'object',
				properties: {
					fleetId: {
						type: 'string',
						pattern: '^0x[a-fA-F0-9]*$',
						description: 'Fleet ID to resolve',
					},
				},
				required: ['fleetId'],
			},
		},
		async (args, extra): Promise<CallToolResult> => {
			try {
				await ensureManagersInitialized();
				if (!fleetManager) {
					throw new Error('Fleet manager not initialized');
				}

				const parsed = args as any;
				const tool = createResolveFleetTool(fleetManager);
				return await tool.execute(parsed);
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: stringifyWithBigInt(
								{
									error: error instanceof Error ? error.message : String(error),
								},
								2,
							),
						},
					],
					isError: true,
				};
			}
		},
	);

	// Register exit_planets tool
	server.registerTool(
		'exit_planets',
		{
			description:
				'Exit (unstake) multiple planets to retrieve staked tokens. The exit process takes time and must be completed later.',
			inputSchema: {
				type: 'object',
				properties: {
					planetIds: {
						type: 'array',
						items: {
							oneOf: [{type: 'string'}, {type: 'number'}],
						},
						description: 'Array of planet location IDs to exit (as hex strings or numbers)',
					},
				},
				required: ['planetIds'],
			},
		},
		async (args, extra): Promise<CallToolResult> => {
			try {
				await ensureManagersInitialized();
				if (!planetManager) {
					throw new Error('Planet manager not initialized');
				}

				const parsed = args as any;
				const tool = createExitPlanetsTool(planetManager);
				return await tool.execute(parsed);
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: stringifyWithBigInt(
								{
									error: error instanceof Error ? error.message : String(error),
								},
								2,
							),
						},
					],
					isError: true,
				};
			}
		},
	);

	// Register get_pending_exits tool
	server.registerTool(
		'get_pending_exits',
		{
			description: 'Get all pending exit (unstake) operations for your planets.',
			inputSchema: {
				type: 'object',
				properties: {},
			},
		},
		async (args, extra): Promise<CallToolResult> => {
			try {
				await ensureManagersInitialized();
				if (!planetManager) {
					throw new Error('Planet manager not initialized');
				}

				const parsed = args as any;
				const tool = createGetPendingExitsTool(planetManager);
				return await tool.execute(parsed);
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: stringifyWithBigInt(
								{
									error: error instanceof Error ? error.message : String(error),
								},
								2,
							),
						},
					],
					isError: true,
				};
			}
		},
	);

	// Register verify_exit_status tool
	server.registerTool(
		'verify_exit_status',
		{
			description:
				"Check and update the status of a planet's exit operation. Verifies if the exit has completed or been interrupted.",
			inputSchema: {
				type: 'object',
				properties: {
					planetId: {
						oneOf: [{type: 'string'}, {type: 'number'}],
						description: 'Planet location ID to verify (as hex string or number)',
					},
				},
				required: ['planetId'],
			},
		},
		async (args, extra): Promise<CallToolResult> => {
			try {
				await ensureManagersInitialized();
				if (!planetManager) {
					throw new Error('Planet manager not initialized');
				}

				const parsed = args as any;
				const tool = createVerifyExitStatusTool(planetManager);
				return await tool.execute(parsed);
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: stringifyWithBigInt(
								{
									error: error instanceof Error ? error.message : String(error),
								},
								2,
							),
						},
					],
					isError: true,
				};
			}
		},
	);

	// Register get_my_planets tool
	server.registerTool(
		'get_my_planets',
		{
			description: 'Get all planets owned by the current user address.',
			inputSchema: {
				type: 'object',
				properties: {
					radius: {
						type: 'number',
						description: 'Search radius around origin (0,0) to find planets',
						default: 100,
					},
				},
			},
		},
		async (args, extra): Promise<CallToolResult> => {
			try {
				await ensureManagersInitialized();
				if (!planetManager) {
					throw new Error('Planet manager not initialized');
				}

				const parsed = args as any;
				const tool = createGetMyPlanetsTool(planetManager);
				return await tool.execute(parsed);
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: stringifyWithBigInt(
								{
									error: error instanceof Error ? error.message : String(error),
								},
								2,
							),
						},
					],
					isError: true,
				};
			}
		},
	);

	// Register get_planets_around tool
	server.registerTool(
		'get_planets_around',
		{
			description:
				'Get planets around a specific location within a certain radius. Useful for finding targets for fleet movement.',
			inputSchema: {
				type: 'object',
				properties: {
					centerPlanetId: {
						oneOf: [{type: 'string'}, {type: 'number'}],
						description: 'Center planet location ID (as hex string or number)',
					},
					radius: {
						type: 'number',
						description: 'Radius in distance units to search around the center planet',
					},
				},
				required: ['centerPlanetId', 'radius'],
			},
		},
		async (args, extra): Promise<CallToolResult> => {
			try {
				await ensureManagersInitialized();
				if (!planetManager) {
					throw new Error('Planet manager not initialized');
				}

				const parsed = args as any;
				const tool = createGetPlanetsAroundTool(planetManager);
				return await tool.execute(parsed);
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: stringifyWithBigInt(
								{
									error: error instanceof Error ? error.message : String(error),
								},
								2,
							),
						},
					],
					isError: true,
				};
			}
		},
	);

	// Register get_pending_fleets tool
	server.registerTool(
		'get_pending_fleets',
		{
			description: 'Get all pending fleets sent from your planets.',
			inputSchema: {
				type: 'object',
				properties: {},
			},
		},
		async (args, extra): Promise<CallToolResult> => {
			try {
				await ensureManagersInitialized();
				if (!fleetManager) {
					throw new Error('Fleet manager not initialized');
				}

				const parsed = args as any;
				const tool = createGetPendingFleetsTool(fleetManager);
				return await tool.execute(parsed);
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: stringifyWithBigInt(
								{
									error: error instanceof Error ? error.message : String(error),
								},
								2,
							),
						},
					],
					isError: true,
				};
			}
		},
	);

	return server;
}
