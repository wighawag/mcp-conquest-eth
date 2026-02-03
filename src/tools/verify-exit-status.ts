import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {PlanetManager} from '../planet/manager.js';

/**
 * Create the verifyExitStatus tool
 */
export function createVerifyExitStatusTool(planetManager: PlanetManager): Tool {
	return {
		name: 'verify_exit_status',
		description:
			"Check and update the status of a planet's exit operation. Verifies if the exit has completed or been interrupted.",
		inputSchema: z.object({
			planetId: z
				.union([z.string(), z.number()])
				.describe('Planet location ID to verify (as hex string or number)'),
		}),
		async execute(args) {
			try {
				const {planetId} = args;

				const result = await planetManager.verifyExitStatus(
					typeof planetId === 'string' ? BigInt(planetId) : BigInt(planetId),
				);

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(
								{
									success: true,
									planetId: result.planetId.toString(),
									status: result.status,
									completed: result.completed,
									interrupted: result.interrupted,
									owner: result.owner,
									numSpaceships: result.numSpaceships,
									exitStartTime: result.exitStartTime,
									exitCompleteTime: result.exitCompleteTime,
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
