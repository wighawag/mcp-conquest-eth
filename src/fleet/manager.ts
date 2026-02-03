import type {Address} from 'viem';
import type {WalletClient} from 'viem';
import type {SpaceInfo} from '../../conquest-eth-v0-contracts/js/index.js';
import type {PendingFleet} from '../types/fleet.js';
import {sendFleet, sendFleetFor} from './send.js';
import {resolveFleetWithSpaceInfo, getResolvableFleets} from './resolve.js';
import type {FleetStorage} from '../storage/interface.js';
import type {ContractConfig} from '../types.js';

/**
 * FleetManager manages the lifecycle of fleets in the Conquest game
 * including sending new fleets and resolving existing ones
 */
export class FleetManager {
	constructor(
		private readonly walletClient: WalletClient | undefined,
		private readonly fleetsCommitContract: {
			address: Address;
			abi: readonly unknown[];
			publicClient: unknown;
			walletClient: WalletClient | undefined;
		},
		private readonly fleetsRevealContract: {
			address: Address;
			abi: readonly unknown[];
			publicClient: unknown;
			walletClient: WalletClient | undefined;
		},
		private readonly spaceInfo: SpaceInfo,
		private readonly contractConfig: ContractConfig,
		private readonly storage: FleetStorage,
		private readonly contractAddress: Address,
	) {}

	/**
	 * Ensure walletClient is available for operations that require it
	 */
	private requireWalletClient(): WalletClient {
		if (!this.walletClient) {
			throw new Error(
				'Wallet client is required for this operation. Please provide a PRIVATE_KEY environment variable.',
			);
		}
		return this.walletClient;
	}

	/**
	 * Send a fleet to a destination planet
	 */
	async send(
		fromPlanetId: bigint,
		toPlanetId: bigint,
		quantity: number,
		options?: {
			gift?: boolean;
			specific?: Address;
			arrivalTimeWanted?: bigint;
			secret?: `0x${string}`;
		},
	): Promise<PendingFleet> {
		return sendFleet(
			this.requireWalletClient(),
			this.contractAddress,
			this.fleetsCommitContract,
			fromPlanetId,
			toPlanetId,
			quantity,
			this.spaceInfo,
			this.contractConfig,
			this.storage,
			options,
		);
	}

	/**
	 * Send a fleet for another address (advanced feature)
	 */
	async sendFor(
		fleetSender: Address,
		fleetOwner: Address,
		fromPlanetId: bigint,
		toPlanetId: bigint,
		quantity: number,
		options?: {
			gift?: boolean;
			specific?: Address;
			arrivalTimeWanted?: bigint;
			secret?: `0x${string}`;
		},
	): Promise<PendingFleet> {
		return sendFleetFor(
			this.requireWalletClient(),
			this.contractAddress,
			this.fleetsCommitContract,
			fleetSender,
			fleetOwner,
			fromPlanetId,
			toPlanetId,
			quantity,
			this.spaceInfo,
			this.contractConfig,
			this.storage,
			options,
		);
	}

	/**
	 * Resolve (reveal) a fleet to complete its journey
	 */
	async resolve(
		fleetId: string,
	): Promise<{resolved: true; fleet: PendingFleet} | {resolved: false; reason: string}> {
		return resolveFleetWithSpaceInfo(
			this.requireWalletClient(),
			this.fleetsRevealContract,
			this.spaceInfo,
			fleetId,
			this.storage,
		);
	}

	/**
	 * Get fleets that can be resolved (not yet resolved and past resolve window)
	 */
	async getResolvableFleets(): Promise<PendingFleet[]> {
		return getResolvableFleets(this.storage, this.contractConfig.resolveWindow);
	}

	/**
	 * Get all pending fleets for the current sender
	 */
	async getMyPendingFleets(): Promise<PendingFleet[]> {
		const sender = this.requireWalletClient().account!.address;
		return this.storage.getPendingFleetsBySender(sender);
	}

	/**
	 * Get a specific fleet by ID
	 */
	async getFleet(fleetId: string): Promise<PendingFleet | null> {
		return this.storage.getFleet(fleetId);
	}

	/**
	 * Get all fleets in storage
	 */
	async getAllFleets(): Promise<PendingFleet[]> {
		return this.storage.getAllFleets();
	}

	/**
	 * Resolve all fleets that are ready (batch operation)
	 */
	async resolveAllReady(): Promise<{
		successful: PendingFleet[];
		failed: Array<{fleetId: string; reason: string}>;
	}> {
		const readyFleets = await this.getResolvableFleets();
		const successful: PendingFleet[] = [];
		const failed: Array<{fleetId: string; reason: string}> = [];

		for (const fleet of readyFleets) {
			const result = await this.resolve(fleet.fleetId);
			if (result.resolved) {
				successful.push(result.fleet);
			} else {
				failed.push({fleetId: fleet.fleetId, reason: result.reason});
			}
		}

		return {successful, failed};
	}

	/**
	 * Clean up old resolved fleets from storage
	 */
	async cleanupOldResolvedFleets(olderThanDays: number = 7): Promise<void> {
		const olderThan = Math.floor(Date.now() / 1000) - olderThanDays * 24 * 60 * 60;
		await this.storage.cleanupOldResolvedFleets(olderThan);
	}
}
