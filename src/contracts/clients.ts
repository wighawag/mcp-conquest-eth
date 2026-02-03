import {createPublicClient, createWalletClient, http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import type {Chain, Address, PublicClient, WalletClient} from 'viem';
import {Artifact_IOuterSpaceInformation} from '../../conquest-eth-v0-contracts/generated/artifacts/IOuterSpaceInformation.js';
import {Artifact_IOuterSpaceFleetsCommit} from '../../conquest-eth-v0-contracts/generated/artifacts/IOuterSpaceFleetsCommit.js';
import {Artifact_IOuterSpaceFleetsReveal} from '../../conquest-eth-v0-contracts/generated/artifacts/IOuterSpaceFleetsReveal.js';
import {Artifact_IOuterSpaceStaking} from '../../conquest-eth-v0-contracts/generated/artifacts/IOuterSpaceStaking.js';
import {Abi_IOuterSpace} from '../../conquest-eth-v0-contracts/generated/abis/IOuterSpace.js';

export function createContractClients(
	chain: Chain,
	rpcUrl: string,
	gameContract: Address,
	privateKey?: `0x${string}`,
): {
	publicClient: PublicClient;
	walletClient: WalletClient | undefined;
	infoContract: {
		address: Address;
		abi: Abi_IOuterSpace;
		publicClient: PublicClient;
		walletClient: WalletClient | undefined;
	};
	fleetsCommitContract: {
		address: Address;
		abi: Abi_IOuterSpace;
		publicClient: PublicClient;
		walletClient: WalletClient | undefined;
	};
	fleetsRevealContract: {
		address: Address;
		abi: Abi_IOuterSpace;
		publicClient: PublicClient;
		walletClient: WalletClient | undefined;
	};
	stakingContract: {
		address: Address;
		abi: Abi_IOuterSpace;
		publicClient: PublicClient;
		walletClient: WalletClient | undefined;
	};
} {
	const transport = http(rpcUrl);

	const publicClient: PublicClient = createPublicClient({
		chain,
		transport,
	});

	const walletClient: WalletClient | undefined = privateKey
		? createWalletClient({
				account: privateKeyToAccount(privateKey),
				chain,
				transport,
			})
		: undefined;

	// Create contract instances
	const infoContract = {
		address: gameContract,
		abi: Artifact_IOuterSpaceInformation.abi as unknown as Abi_IOuterSpace,
		publicClient,
		walletClient,
	};

	const fleetsCommitContract = {
		address: gameContract,
		abi: Artifact_IOuterSpaceFleetsCommit.abi as unknown as Abi_IOuterSpace,
		publicClient,
		walletClient,
	};

	const fleetsRevealContract = {
		address: gameContract,
		abi: Artifact_IOuterSpaceFleetsReveal.abi as unknown as Abi_IOuterSpace,
		publicClient,
		walletClient,
	};

	const stakingContract = {
		address: gameContract,
		abi: Artifact_IOuterSpaceStaking.abi as unknown as Abi_IOuterSpace,
		publicClient,
		walletClient,
	};

	return {
		publicClient,
		walletClient,
		infoContract,
		fleetsCommitContract,
		fleetsRevealContract,
		stakingContract,
	};
}
