import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import pkg from '../package.json' with {type: 'json'};
import z from 'zod';
import {CallToolResult, Implementation} from '@modelcontextprotocol/sdk/types.js';
import {Chain} from 'viem';
import {ServerOptions} from '@modelcontextprotocol/sdk/server';
import {createServer as createMCPEthereumServer} from 'mcp-ethereum';
import {getClients} from 'mcp-ethereum/helpers';

// Helper function to handle BigInt serialization in JSON.stringify
function stringifyWithBigInt(obj: any, space?: number): string {
	return JSON.stringify(
		obj,
		(_key, value) => (typeof value === 'bigint' ? value.toString() : value),
		space,
	);
}

export function createServer(
	params: {chain: Chain; privateKey?: `0x${string}`},
	options?: {
		ethereum?: boolean;
		rpcURL?: string;
		serverOptions?: ServerOptions;
		serverInfo?: Implementation;
	},
) {
	const {publicClient, walletClient} = getClients(params, options);

	const name = `${pkg.name}-server`;
	const server = options?.ethereum
		? createMCPEthereumServer(params, {
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

	server.registerTool(
		'todo',
		{
			description: 'TODO',
			inputSchema: {},
		},
		async (_params, extra): Promise<CallToolResult> => {
			try {
				const block = await publicClient.getBlock();

				return {
					content: [
						{
							type: 'text',
							text: stringifyWithBigInt(block, 2),
						},
					],
				};
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
