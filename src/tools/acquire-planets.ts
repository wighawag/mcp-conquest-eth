import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {PlanetManager} from '../planet/manager.js';

/**
 * Create the acquirePlanets tool
 */
export function createAcquirePlanetsTool(planetManager: PlanetManager): Tool {
	return {
		name: 'acquire_planets',
		description:
			'Acquire (stake) multiple planets in the Conquest game. This allows you to take ownership of unclaimed planets.',
		inputSchema: z.object({
			planetIds: z
				.array(z.union([z.string(), z.number()]))
				.describe('Array of planet location IDs to acquire (as hex strings or numbers)'),
			amountToMint: z.number().describe('Amount of native token to spend to acquire the planets'),
			tokenAmount: z.number().describe('Amount of staking token to spend to acquire the planets'),
		}),
		async execute(args) {
			try {
				const {planetIds, amountToMint, tokenAmount} = args;

				// Convert planet IDs to BigInt
				const planetIdsBigInt = planetIds.map((id) =>
					typeof id === 'string' ? BigInt(id) : BigInt(id),
				);

				const result = await planetManager.acquire(planetIdsBigInt, amountToMint, tokenAmount);

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(
								{
									success: true,
									transactionHash: result.hash,
									planetsAcquired: result.planetsAcquired.map((id) => id.toString()),
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(
								{
									success: false,
									error: error instanceof Error ? error.message : String(error),
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
			}
		},
	};
}
