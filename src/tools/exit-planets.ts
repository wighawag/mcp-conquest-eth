import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {PlanetManager} from '../planet/manager.js';

/**
 * Create the exitPlanets tool
 */
export function createExitPlanetsTool(planetManager: PlanetManager): Tool {
	return {
		name: 'exit_planets',
		description:
			'Exit (unstake) multiple planets to retrieve staked tokens. The exit process takes time and must be completed later.',
		inputSchema: z.object({
			planetIds: z
				.array(z.union([z.string(), z.number()]))
				.describe('Array of planet location IDs to exit (as hex strings or numbers)'),
		}),
		async execute(args) {
			try {
				const {planetIds} = args;

				// Convert planet IDs to BigInt
				const planetIdsBigInt = planetIds.map((id) =>
					typeof id === 'string' ? BigInt(id) : BigInt(id),
				);

				const result = await planetManager.exit(planetIdsBigInt);

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(
								{
									success: true,
									transactionHash: result.hash,
									planetsExited: result.planetsExited.map((id) => id.toString()),
									exitDurations: result.exitDurations.map((d) => d.toString()),
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
