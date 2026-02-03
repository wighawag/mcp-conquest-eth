import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { FleetManager } from '../fleet/manager.js';

/**
 * Create the resolveFleet tool
 */
export function createResolveFleetTool(fleetManager: FleetManager): Tool {
	return {
		name: 'resolve_fleet',
		description:
			'Resolve a previously sent fleet. This must be called after the fleet arrival time + resolve window to reveal the destination and secret.',
		inputSchema: z.object({
			fleetId: z.string().regex(/^0x[a-fA-F0-9]*$/).describe('Fleet ID to resolve'),
		}),
		async execute(args) {
			try {
				const { fleetId } = args;

				const result = await fleetManager.resolve(fleetId);

				if (result.resolved) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify(
									{
										success: true,
										fleetId: result.fleet.fleetId,
										fromPlanetId: result.fleet.fromPlanetId.toString(),
										toPlanetId: result.fleet.toPlanetId.toString(),
										quantity: result.fleet.quantity,
									},
									null,
									2
								),
							},
						],
					};
				} else {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify(
									{
										success: false,
										reason: result.reason,
									},
									null,
									2
								),
							},
						],
						isError: true,
					};
				}
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