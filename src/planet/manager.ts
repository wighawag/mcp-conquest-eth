import type { Address } from 'viem';
import type { WalletClient } from 'viem';
import type { SpaceInfo } from '../../conquest-eth-v0-contracts/js/index.js';
import type { PlanetInfo } from '../../conquest-eth-v0-contracts/js/types.js';
import type { ExternalPlanet } from '../types/planet.js';
import type { PendingExit } from '../types/planet.js';
import { acquirePlanets } from './acquire.js';
import { exitPlanets } from './exit.js';
import type { FleetStorage } from '../storage/interface.js';

export interface ContractConfig {
	genesis: bigint;
	resolveWindow: bigint;
	timePerDistance: bigint;
	exitDuration: bigint;
	acquireNumSpaceships: number;
	[key: string]: bigint | number;
}

/**
 * PlanetManager manages planet-related operations in the Conquest game
 * including acquiring new planets and initiating exit processes
 */
export class PlanetManager {
	constructor(
		private readonly walletClient: WalletClient,
		private readonly stakingContract: {
			address: Address;
			abi: readonly unknown[];
			publicClient: unknown;
			walletClient: WalletClient | undefined;
		},
		private readonly infoContract: {
			address: Address;
			abi: readonly unknown[];
			publicClient: unknown;
			walletClient: WalletClient | undefined;
		},
		private readonly spaceInfo: SpaceInfo,
		private readonly contractConfig: ContractConfig,
		private readonly storage: FleetStorage
	) {}

	/**
	 * Acquire (stake) multiple planets
	 */
	async acquire(
		planetIds: bigint[],
		amountToMint: number,
		tokenAmount: number
	): Promise<{ hash: `0x${string}`; planetsAcquired: bigint[] }> {
		return acquirePlanets(
			this.walletClient,
			this.stakingContract.address as Address,
			this.stakingContract.abi,
			planetIds,
			amountToMint,
			tokenAmount
		);
	}

	/**
	 * Exit (unstake) multiple planets
	 */
	async exit(planetIds: bigint[], owner?: Address): Promise<{ hash: `0x${string}`; exitsInitiated: bigint[] }> {
		const exitOwner = owner || this.walletClient.account!.address;
		return exitPlanets(
			this.walletClient,
			this.stakingContract.address as Address,
			this.stakingContract.abi,
			exitOwner,
			planetIds,
			this.contractConfig.exitDuration,
			this.storage
		);
	}

	/**
	 * Get planet info by location ID
	 */
	getPlanetInfo(planetId: bigint): PlanetInfo | undefined {
		return this.spaceInfo.getPlanetInfoViaId(planetId);
	}

	/**
	 * Get multiple planet infos
	 */
	getPlanetInfos(planetIds: bigint[]): (PlanetInfo | undefined)[] {
		return planetIds.map(id => this.getPlanetInfo(id));
	}

	/**
	 * Get planets around a center point within a radius
	 */
	async getPlanetsAround(
		centerX: number,
		centerY: number,
		radius: number
	): Promise<{ info: PlanetInfo; state?: ExternalPlanet }[]> {
		// Get planet infos from SpaceInfo
		const planets = [];
		for (const planet of this.spaceInfo.yieldPlanetsFromRect(
			centerX - radius,
			centerY - radius,
			centerX + radius,
			centerY + radius
		)) {
			// Calculate actual distance to filter by radius
			const dx = planet.location.x - centerX;
			const dy = planet.location.y - centerY;
			const distance = Math.sqrt(dx * dx + dy * dy);
			if (distance <= radius) {
				planets.push({ info: planet });
			}
		}
		return planets;
	}

	/**
	 * Get my planets (owned by the current wallet)
	 */
	async getMyPlanets(radius: number = 100): Promise<Array<{ info: PlanetInfo; state: ExternalPlanet }>> {
		const sender = this.walletClient.account!.address;

		// For now, use a simple approach: get all planets in area and filter by owner
		// A better approach would be to use an index or The Graph
		const myPlanets: Array<{ info: PlanetInfo; state: ExternalPlanet }> = [];

		// Get planets from 0,0 out to radius
		for (const planet of this.spaceInfo.yieldPlanetsFromRect(-radius, -radius, radius, radius)) {
			// Query contract for planet state
			const states = await (this.infoContract.publicClient as any).readContract({
				address: this.infoContract.address as Address,
				abi: this.infoContract.abi,
				functionName: 'getPlanetStates',
				args: [[planet.location.id]],
			}) as ExternalPlanet[];

			if (states.length > 0 && states[0].owner && states[0].owner.toLowerCase() === sender.toLowerCase()) {
				myPlanets.push({ info: planet, state: states[0] });
			}
		}

		return myPlanets;
	}

	/**
	 * Get pending exits for the current player
	 */
	async getMyPendingExits(): Promise<PendingExit[]> {
		const sender = this.walletClient.account!.address;
		return this.storage.getPendingExitsByPlayer(sender as Address);
	}

	/**
	 * Verify exit status for a planet
	 */
	async verifyExitStatus(planetId: bigint): Promise<{ exit: PendingExit; interrupted: boolean; newOwner?: Address }> {
		const exit = await this.storage.getPendingExit(planetId);
		if (!exit) {
			throw new Error(`No pending exit found for planet ${planetId}`);
		}

		// Query contract for current planet state
		const states = await (this.infoContract.publicClient as any).readContract({
			address: this.infoContract.address as Address,
			abi: this.infoContract.abi,
			functionName: 'getPlanetStates',
			args: [[planetId]],
		}) as ExternalPlanet[];

		if (states.length === 0) {
			throw new Error(`Could not get planet state for ${planetId}`);
		}

		const currentState = states[0];
		const currentTime = Math.floor(Date.now() / 1000);

		// Check if exit was interrupted by an attack
		let interrupted = false;
		if (currentState.owner && currentState.owner.toLowerCase() !== exit.player.toLowerCase()) {
			interrupted = true;
			await this.storage.markExitInterrupted(planetId, currentTime, currentState.owner as Address);
		}

		// Check if exit is complete
		if (!currentState.active && currentTime >= exit.exitCompleteTime) {
			await this.storage.markExitCompleted(planetId, currentTime);
		}

		const updatedExit = await this.storage.getPendingExit(planetId);
		if (!updatedExit) {
			throw new Error('Exit was cleaned up during verification');
		}

		return {
			exit: updatedExit,
			interrupted,
			newOwner: currentState.owner as Address,
		};
	}

	/**
	 * Clean up old completed exits
	 */
	async cleanupOldCompletedExits(olderThanDays: number = 7): Promise<void> {
		const olderThan = Math.floor(Date.now() / 1000) - (olderThanDays * 24 * 60 * 60);
		await this.storage.cleanupOldCompletedExits(olderThan);
	}

	/**
	 * Calculate distance between two planets
	 */
	calculateDistance(fromPlanetId: bigint, toPlanetId: bigint): number | undefined {
		const fromPlanet = this.getPlanetInfo(fromPlanetId);
		const toPlanet = this.getPlanetInfo(toPlanetId);

		if (!fromPlanet || !toPlanet) {
			return undefined;
		}

		return this.spaceInfo.distance(fromPlanet, toPlanet);
	}

	/**
	 * Calculate estimated arrival time for a fleet
	 */
	calculateEstimatedArrivalTime(fromPlanetId: bigint, toPlanetId: bigint): number | undefined {
		const distance = this.calculateDistance(fromPlanetId, toPlanetId);
		if (distance === undefined) {
			return undefined;
		}

		const travelTime = distance * Number(this.contractConfig.timePerDistance);
		return Number(this.contractConfig.genesis) + travelTime;
	}
}