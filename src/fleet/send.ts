import type { Address } from 'viem';
import type { WalletClient } from 'viem';
import type { SpaceInfo } from '../../conquest-eth-v0-contracts/js/index.js';
import type { PendingFleet } from '../types/fleet.js';
import { computeToHash, computeFleetId, generateSecret } from '../util/hashing.js';
import { calculateEstimatedArrivalTime, getCurrentTimestamp } from '../util/time.js';
import type { FleetStorage } from '../storage/interface.js';

export interface ContractConfig {
	genesis: bigint;
	resolveWindow: bigint;
	timePerDistance: bigint;
	exitDuration: bigint;
	[key: string]: bigint;
}

/**
 * Send a fleet to a destination planet
 *
 * @param walletClient - Viem wallet client for signing transactions
 * @param contractAddress - The game contract address
 * @param fleetsCommitContract - The fleets commit contract instance
 * @param fromPlanetId - Source planet location ID
 * @param toPlanetId - Destination planet location ID
 * @param quantity - Number of spaceships to send
 * @param spaceInfo - SpaceInfo instance for distance calculation
 * @param contractConfig - Contract config for time calculations
 * @param storage - Storage instance for tracking pending fleets
 * @param options - Optional parameters
 * @returns The pending fleet information
 */
export async function sendFleet(
	walletClient: WalletClient,
	contractAddress: Address,
	fleetsCommitContract: {
		address: Address;
		abi: readonly unknown[];
		publicClient: unknown;
		walletClient: WalletClient | undefined;
	},
	fromPlanetId: bigint,
	toPlanetId: bigint,
	quantity: number,
	spaceInfo: SpaceInfo,
	contractConfig: ContractConfig,
	storage: FleetStorage,
	options?: {
		gift?: boolean;
		specific?: Address;
		arrivalTimeWanted?: bigint;
		secret?: `0x${string}`;
	}
): Promise<PendingFleet> {
	const fleetSender = walletClient.account!.address;
	const operator = fleetSender; // Default to same address

	// Get planet info for distance calculation
	const fromPlanet = spaceInfo.getPlanetInfoViaId(fromPlanetId);
	const toPlanet = spaceInfo.getPlanetInfoViaId(toPlanetId);

	if (!fromPlanet || !toPlanet) {
		throw new Error('Could not get planet info for one or both planets');
	}

	// Calculate distance
	const distance = spaceInfo.distance(fromPlanet, toPlanet);

	// Generate secret if not provided
	const secret = options?.secret || generateSecret();

	// Calculate estimated arrival time using contract config
	const estimatedArrivalTime = calculateEstimatedArrivalTime(
		BigInt(distance),
		contractConfig.timePerDistance,
		contractConfig.genesis
	);

	// Compute the toHash (commitment to destination + secret)
	const toHash = computeToHash(toPlanetId, secret);

	// Get the contract send function signature
	const publicClient = fleetsCommitContract.publicClient as any;
	const request = await publicClient.simulateContract({
		address: fleetsCommitContract.address as Address,
		abi: fleetsCommitContract.abi,
		functionName: 'send',
		args: [fromPlanetId, quantity, toHash],
		account: fleetSender,
	});

	// Send the transaction
	const hash = await walletClient.writeContract(request);

	// Compute fleet ID
	const fleetId = computeFleetId(toHash, fromPlanetId, fleetSender, operator);

	// Create pending fleet record
	const pendingFleet: PendingFleet = {
		fleetId,
		fromPlanetId,
		toPlanetId,
		quantity,
		secret,
		gift: options?.gift ?? false,
		specific: options?.specific ?? ('0x0000000000000000000000000000000000000000' as Address),
		arrivalTimeWanted: options?.arrivalTimeWanted ?? BigInt(estimatedArrivalTime),
		fleetSender,
		operator,
		committedAt: getCurrentTimestamp(),
		estimatedArrivalTime,
		resolved: false,
	};

	// Save to storage
	await storage.saveFleet(pendingFleet);

	return pendingFleet;
}

/**
 * Send a fleet for another address (advanced feature)
 *
 * @param walletClient - Viem wallet client for signing transactions
 * @param contractAddress - The game contract address
 * @param fleetsCommitContract - The fleets commit contract instance
 * @param fleetSender - The address that owns the fleet
 * @param fleetOwner - The address that owns the planet (may be different)
 * @param fromPlanetId - Source planet location ID
 * @param toPlanetId - Destination planet location ID
 * @param quantity - Number of spaceships to send
 * @param spaceInfo - SpaceInfo instance for distance calculation
 * @param contractConfig - Contract config for time calculations
 * @param storage - Storage instance for tracking pending fleets
 * @param options - Optional parameters
 * @returns The pending fleet information
 */
export async function sendFleetFor(
	walletClient: WalletClient,
	contractAddress: Address,
	fleetsCommitContract: {
		address: Address;
		abi: readonly unknown[];
		publicClient: unknown;
		walletClient: WalletClient | undefined;
	},
	fleetSender: Address,
	fleetOwner: Address,
	fromPlanetId: bigint,
	toPlanetId: bigint,
	quantity: number,
	spaceInfo: SpaceInfo,
	contractConfig: ContractConfig,
	storage: FleetStorage,
	options?: {
		gift?: boolean;
		specific?: Address;
		arrivalTimeWanted?: bigint;
		secret?: `0x${string}`;
	}
): Promise<PendingFleet> {
	const operator = walletClient.account!.address;

	// Get planet info for distance calculation
	const fromPlanet = spaceInfo.getPlanetInfoViaId(fromPlanetId);
	const toPlanet = spaceInfo.getPlanetInfoViaId(toPlanetId);

	if (!fromPlanet || !toPlanet) {
		throw new Error('Could not get planet info for one or both planets');
	}

	// Calculate distance
	const distance = spaceInfo.distance(fromPlanet, toPlanet);

	// Generate secret if not provided
	const secret = options?.secret || generateSecret();

	// Calculate estimated arrival time using contract config
	const estimatedArrivalTime = calculateEstimatedArrivalTime(
		BigInt(distance),
		contractConfig.timePerDistance,
		contractConfig.genesis
	);

	// Compute the toHash (commitment to destination + secret)
	const toHash = computeToHash(toPlanetId, secret);

	// Get the contract sendFor function signature
	const publicClient = fleetsCommitContract.publicClient as any;
	const request = await publicClient.simulateContract({
		address: fleetsCommitContract.address as Address,
		abi: fleetsCommitContract.abi,
		functionName: 'sendFor',
		args: [{
			fleetSender,
			fleetOwner,
			from: fromPlanetId,
			quantity,
			toHash,
		}],
		account: operator,
	});

	// Send the transaction
	const hash = await walletClient.writeContract(request);

	// Compute fleet ID
	const fleetId = computeFleetId(toHash, fromPlanetId, fleetSender, operator);

	// Create pending fleet record
	const pendingFleet: PendingFleet = {
		fleetId,
		fromPlanetId,
		toPlanetId,
		quantity,
		secret,
		gift: options?.gift ?? false,
		specific: options?.specific ?? ('0x0000000000000000000000000000000000000000' as Address),
		arrivalTimeWanted: options?.arrivalTimeWanted ?? BigInt(estimatedArrivalTime),
		fleetSender,
		operator,
		committedAt: getCurrentTimestamp(),
		estimatedArrivalTime,
		resolved: false,
	};

	// Save to storage
	await storage.saveFleet(pendingFleet);

	return pendingFleet;
}