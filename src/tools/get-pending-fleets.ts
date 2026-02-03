import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {FleetManager} from '../fleet/manager.js';

/**
 * Create the getPendingFleets tool
 */
export function createGetPendingFleetsTool(fleetManager: FleetManager): Tool {
	return {
		name: 'get_pending_fleets',
		description: 'Get all pending fleets sent from your planets.',
		inputSchema: z.object({}),
		async execute() {
			try {
				const fleets = await fleetManager.getMyPendingFleets();

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(
								{
									success: true,
									fleets: fleets.map((fleet) => ({
										fleetId: fleet.fleetId,
										fromPlanetId: fleet.fromPlanetId.toString(),
										toPlanetId: fleet.toPlanetId.toString(),
										quantity: fleet.quantity,
										secret: fleet.secret,
										gift: fleet.gift,
										specific: fleet.specific,
										arrivalTimeWanted: fleet.arrivalTimeWanted.toString(),
										fleetSender: fleet.fleetSender,
										operator: fleet.operator,
										committedAt: fleet.committedAt,
										estimatedArrivalTime: fleet.estimatedArrivalTime,
										resolved: fleet.resolved,
										resolvedAt: fleet.resolvedAt,
									})),
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
