import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PlanetManager } from '../planet/manager.js';

/**
 * Create the getMyPlanets tool
 */
export function createGetMyPlanetsTool(planetManager: PlanetManager): Tool {
	return {
		name: 'get_my_planets',
		description: 'Get all planets owned by the current user address.',
		inputSchema: z.object({
			radius: z
				.number()
				.optional()
				.default(100)
				.describe('Search radius around origin (0,0) to find planets'),
		}),
		async execute(args) {
			try {
				const { radius } = args;
				const planets = await planetManager.getMyPlanets(radius);

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(
								{
									success: true,
									planets: planets.map(({ info, state }) => ({
										planetId: info.location.id.toString(),
										owner: state.owner,
										location: {
											x: info.location.x,
											y: info.location.y,
										},
										level: info.level,
										lastUpdate: info.lastUpdate.toString(),
										numSpaceships: state.numSpaceships,
										isHomePlanet: info.isHomePlanet,
									})),
								},
								null,
								2
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
								2
							),
						},
					],
					isError: true,
				};
			}
		},
	};
}