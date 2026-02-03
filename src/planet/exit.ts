import type { Address } from 'viem';
import type { WalletClient } from 'viem';
import type { PendingExit } from '../types/planet.js';
import { getCurrentTimestamp } from '../util/time.js';
import type { FleetStorage } from '../storage/interface.js';

/**
 * Exit (unstake) multiple planets
 * 
 * @param walletClient - Viem wallet client for signing transactions
 * @param contractAddress - The game contract address
 * @param contractAbi - The contract ABI
 * @param owner - The owner of the planets
 * @param planetIds - Array of planet location IDs to exit
 * @param exitDuration - The exit duration from contract config
 * @param storage - Storage instance for tracking pending exits
 * @returns Transaction hash and list of exits initiated
 */
export async function exitPlanets(
	walletClient: WalletClient,
	contractAddress: Address,
	contractAbi: readonly unknown[],
	owner: Address,
	planetIds: bigint[],
	exitDuration: bigint,
	storage: FleetStorage
): Promise<{ hash: `0x${string}`; exitsInitiated: bigint[] }> {
	const operator = walletClient.account!.address;
	const currentTime = getCurrentTimestamp();

	// Get planet states to verify ownership
	const publicClient = walletClient as any;
	const states = await publicClient.readContract({
		address: contractAddress,
		abi: contractAbi,
		functionName: 'getPlanetStates',
		args: [planetIds],
	}) as Array<{
		owner: Address;
		numSpaceships: number;
		// ... other fields
	}>;

	// Create pending exit records for each planet
	const exitsInitiated: bigint[] = [];
	for (let i = 0; i < planetIds.length; i++) {
		const planetId = planetIds[i];
		const state = states[i];

		// Only create exit record for planets owned by the owner
		if (state.owner && state.owner.toLowerCase() === owner.toLowerCase()) {
			const exit: PendingExit = {
				planetId,
				player: owner,
				exitStartTime: currentTime,
				exitDuration: Number(exitDuration),
				exitCompleteTime: currentTime + Number(exitDuration),
				numSpaceships: state.numSpaceships,
				owner: state.owner,
				completed: false,
				interrupted: false,
				lastCheckedAt: currentTime,
			};

			await storage.savePendingExit(exit);
			exitsInitiated.push(planetId);
		}
	}

	// Get the contract exitMultipleFor function signature
	const request = await publicClient.simulateContract({
		address: contractAddress,
		abi: contractAbi,
		functionName: 'exitMultipleFor',
		args: [owner, planetIds],
		account: operator,
	});

	// Send the transaction
	const hash = await walletClient.writeContract(request);

	return { hash, exitsInitiated };
}