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
import type {ContractConfig} from './types.js';
import {SpaceInfo} from '../conquest-eth-v0-contracts/js/index.js';

// Tool handlers and schemas
import {
	handleAcquirePlanets,
	acquirePlanetsSchema,
} from './tools/acquire-planets.js';
import {
	handleSendFleet,
	sendFleetSchema,
} from './tools/send-fleet.js';
import {
	handleResolveFleet,
	resolveFleetSchema,
} from './tools/resolve-fleet.js';
import {
	handleExitPlanets,
	exitPlanetsSchema,
} from './tools/exit-planets.js';
import {
	handleGetPendingExits,
	getPendingExitsSchema,
} from './tools/get-pending-exits.js';
import {
	handleVerifyExitStatus,
	verifyExitStatusSchema,
} from './tools/verify-exit-status.js';
import {
	handleGetMyPlanets,
	getMyPlanetsSchema,
} from './tools/get-my-planets.js';
import {
	handleGetPlanetsAround,
	getPlanetsAroundSchema,
} from './tools/get-planets-around.js';
import {
	handleGetPendingFleets,
	getPendingFleetsSchema,
} from './tools/get-pending-fleets.js';

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
		params.privateKey
	);

	// Initialize SpaceInfo and contractConfig
	let spaceInfo: SpaceInfo | null = null;
	let contractConfig: ContractConfig | null = null;

	const initSpaceInfo = async () => {
		if (!spaceInfo || !contractConfig) {
			const result = await createSpaceInfo(
				contractClients.publicClient,
				contractClients.infoContract.address as `0x${string}`
			);
			spaceInfo = result.spaceInfo;
			contractConfig = result.contractConfig;
		}
		return {spaceInfo, contractConfig};
	};

	// Initialize storage
	const storageConfig = options?.storageConfig || {type: 'json', dataDir: './data'};
	const storage = new JsonFleetStorage(storageConfig.dataDir || './data');

	// Initialize managers (will be initialized after spaceInfo is ready)
	let fleetManager: FleetManager | null = null;
	let planetManager: PlanetManager | null = null;

	// Helper to ensure managers are initialized
	const ensureManagersInitialized = async () => {
		const {spaceInfo: si, contractConfig: cc} = await initSpaceInfo();

		if (!fleetManager && walletClient && si && cc) {
			fleetManager = new FleetManager(
				walletClient as any, // Type assertion due to viem version compatibility between mcp-ethereum and viem
				contractClients.fleetsCommitContract,
				contractClients.fleetsRevealContract,
				si,
				cc,
				storage,
				gameContract
			);
		}

		if (!planetManager && walletClient && si && cc) {
			planetManager = new PlanetManager(
				walletClient as any, // Type assertion due to viem version compatibility between mcp-ethereum and viem
				contractClients.stakingContract,
				contractClients.infoContract,
				si,
				cc,
				storage
			);
		}
	};

	// Register acquire_planets tool
	server.registerTool(
		'acquire_planets',
		{
			description: 'Acquire (stake) multiple planets in the Conquest game. This allows you to take ownership of unclaimed planets.',
			inputSchema: acquirePlanetsSchema,
		},
		async (args: unknown) => {
			try {
				await ensureManagersInitialized();
				if (!planetManager) {
					throw new Error('Planet manager not initialized');
				}
				return await handleAcquirePlanets(args, null, planetManager);
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
			description: 'Send a fleet from one planet to another in the Conquest game. The fleet will travel through space and can be resolved after arrival.',
			inputSchema: sendFleetSchema,
		},
		async (args: unknown) => {
			try {
				await ensureManagersInitialized();
				if (!fleetManager) {
					throw new Error('Fleet manager not initialized');
				}
				return await handleSendFleet(args, null, fleetManager);
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
			description: 'Resolve a previously sent fleet. This must be called after the fleet arrival time + resolve window to reveal the destination and secret.',
			inputSchema: resolveFleetSchema,
		},
		async (args: unknown) => {
			try {
				await ensureManagersInitialized();
				if (!fleetManager) {
					throw new Error('Fleet manager not initialized');
				}
				return await handleResolveFleet(args, null, fleetManager);
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
			description: 'Exit (unstake) multiple planets to retrieve staked tokens. The exit process takes time and must be completed later.',
			inputSchema: exitPlanetsSchema,
		},
		async (args: unknown) => {
			try {
				await ensureManagersInitialized();
				if (!planetManager) {
					throw new Error('Planet manager not initialized');
				}
				return await handleExitPlanets(args, null, planetManager);
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
			inputSchema: getPendingExitsSchema,
		},
		async (args: unknown) => {
			try {
				await ensureManagersInitialized();
				if (!planetManager) {
					throw new Error('Planet manager not initialized');
				}
				return await handleGetPendingExits(args, null, planetManager);
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
			description: "Check and update the status of a planet's exit operation. Verifies if the exit has completed or been interrupted.",
			inputSchema: verifyExitStatusSchema,
		},
		async (args: unknown) => {
			try {
				await ensureManagersInitialized();
				if (!planetManager) {
					throw new Error('Planet manager not initialized');
				}
				return await handleVerifyExitStatus(args, null, planetManager);
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
			inputSchema: getMyPlanetsSchema,
		},
		async (args: unknown) => {
			try {
				await ensureManagersInitialized();
				if (!planetManager) {
					throw new Error('Planet manager not initialized');
				}
				return await handleGetMyPlanets(args, null, planetManager);
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
			description: 'Get planets around a specific location within a certain radius. Useful for finding targets for fleet movement.',
			inputSchema: getPlanetsAroundSchema,
		},
		async (args: unknown) => {
			try {
				await ensureManagersInitialized();
				if (!planetManager) {
					throw new Error('Planet manager not initialized');
				}
				return await handleGetPlanetsAround(args, null, planetManager);
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
			inputSchema: getPendingFleetsSchema,
		},
		async (args: unknown) => {
			try {
				await ensureManagersInitialized();
				if (!fleetManager) {
					throw new Error('Fleet manager not initialized');
				}
				return await handleGetPendingFleets(args, null, fleetManager);
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