import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {FleetManager} from '../fleet/manager.js';

/**
 * Create the sendFleet tool
 */
export function createSendFleetTool(fleetManager: FleetManager): Tool {
	return {
		name: 'send_fleet',
		description:
			'Send a fleet from one planet to another in the Conquest game. The fleet will travel through space and can be resolved after arrival.',
		inputSchema: z.object({
			fromPlanetId: z
				.union([z.string(), z.number()])
				.describe('Source planet location ID (as hex string or number)'),
			toPlanetId: z
				.union([z.string(), z.number()])
				.describe('Destination planet location ID (as hex string or number)'),
			quantity: z.number().describe('Number of spaceships to send'),
			arrivalTimeWanted: z
				.number()
				.optional()
				.describe(
					'Desired arrival time (timestamp in seconds). If not specified, will be calculated based on distance.',
				),
			gift: z
				.boolean()
				.optional()
				.default(false)
				.describe('Whether the fleet is a gift (sent without requiring arrival)'),
			specific: z
				.string()
				.regex(/^0x[a-fA-F0-9]*$/)
				.optional()
				.default('0x')
				.describe('Additional specific data for the fleet'),
		}),
		async execute(args) {
			try {
				const {fromPlanetId, toPlanetId, quantity, arrivalTimeWanted, gift, specific} = args;

				const result = await fleetManager.send(
					typeof fromPlanetId === 'string' ? BigInt(fromPlanetId) : BigInt(fromPlanetId),
					typeof toPlanetId === 'string' ? BigInt(toPlanetId) : BigInt(toPlanetId),
					quantity,
					{
						arrivalTimeWanted:
							typeof arrivalTimeWanted === 'undefined' ? undefined : BigInt(arrivalTimeWanted),
						gift,
						specific: specific as `0x${string}`,
					},
				);

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(
								{
									success: true,
									fleetId: result.fleetId,
									fromPlanetId: result.fromPlanetId.toString(),
									toPlanetId: result.toPlanetId.toString(),
									quantity: result.quantity,
									arrivalTimeWanted: result.arrivalTimeWanted.toString(),
									secret: result.secret,
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
