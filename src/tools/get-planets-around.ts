import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {PlanetManager} from '../planet/manager.js';

/**
 * Tool handler for getting planets around
 */
export async function handleGetPlanetsAround(
	args: unknown,
	_extra: unknown,
	planetManager: PlanetManager
): Promise<CallToolResult> {
	try {
		const parsed = z.object({
			centerPlanetId: z.union([z.string(), z.number()]),
			radius: z.number(),
		}).parse(args);
		const {centerPlanetId, radius} = parsed;

		// Get center planet info to get its coordinates
		const centerPlanet = planetManager.getPlanetInfo(
			typeof centerPlanetId === 'string' ? BigInt(centerPlanetId) : BigInt(centerPlanetId)
		);

		if (!centerPlanet) {
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(
							{
								success: false,
								error: `Planet ${centerPlanetId} not found`,
							},
							null,
							2
						),
					},
				],
				isError: true,
			};
		}

		const planets = await planetManager.getPlanetsAround(
			centerPlanet.location.x,
			centerPlanet.location.y,
			radius
		);

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							success: true,
							center: {
								planetId: centerPlanet.location.id.toString(),
								x: centerPlanet.location.x,
								y: centerPlanet.location.y,
							},
							radius,
							planets: planets.map(({info, state}) => ({
								planetId: info.location.id.toString(),
								distance: planetManager.calculateDistance(
									centerPlanet.location.id,
									info.location.id
								),
								owner: state?.owner || null,
								location: {
									x: info.location.x,
									y: info.location.y,
								},
								numSpaceships: state?.numSpaceships || 0,
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
}

/**
 * Tool schema for getting planets around (ZodRawShapeCompat format)
 */
export const getPlanetsAroundSchema = {
	centerPlanetId: z.union([z.string(), z.number()]).describe('Center planet location ID (as hex string or number)'),
	radius: z.number().describe('Radius in distance units to search around the center planet'),
};