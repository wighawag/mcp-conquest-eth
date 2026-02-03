import type {Address} from 'viem';
import type {WalletClient} from 'viem';

/**
 * Acquire (stake) multiple planets
 *
 * @param walletClient - Viem wallet client for signing transactions
 * @param contractAddress - The game contract address
 * @param contractAbi - The contract ABI
 * @param planetIds - Array of planet location IDs to acquire
 * @param amountToMint - Amount of native token to spend
 * @param tokenAmount - Amount of staking token to spend
 * @returns Transaction hash and list of planets acquired
 */
export async function acquirePlanets(
	walletClient: WalletClient,
	contractAddress: Address,
	contractAbi: readonly unknown[],
	planetIds: bigint[],
	amountToMint: number,
	tokenAmount: number,
): Promise<{hash: `0x${string}`; planetsAcquired: bigint[]}> {
	const sender = walletClient.account!.address;

	// Get the contract acquireMultipleViaNativeTokenAndStakingToken function signature
	const publicClient = walletClient as any;
	const request = await publicClient.simulateContract({
		address: contractAddress,
		abi: contractAbi,
		functionName: 'acquireMultipleViaNativeTokenAndStakingToken',
		args: [planetIds, amountToMint, tokenAmount],
		account: sender,
		value: BigInt(amountToMint),
	});

	// Send the transaction
	const hash = await walletClient.writeContract(request);

	return {hash, planetsAcquired: planetIds};
}
