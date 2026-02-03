import {createPublicClient, createWalletClient, http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import type {Chain, Address, PublicClient, WalletClient} from 'viem';
import {Artifact_IOuterSpaceInformation} from '../../conquest-eth-v0-contracts/generated/artifacts/IOuterSpaceInformation.js';
import {Artifact_IOuterSpaceFleetsCommit} from '../../conquest-eth-v0-contracts/generated/artifacts/IOuterSpaceFleetsCommit.js';
import {Artifact_IOuterSpaceFleetsReveal} from '../../conquest-eth-v0-contracts/generated/artifacts/IOuterSpaceFleetsReveal.js';
import {Artifact_IOuterSpaceStaking} from '../../conquest-eth-v0-contracts/generated/artifacts/IOuterSpaceStaking.js';

type IOuterSpaceInformation = (typeof Artifact_IOuterSpaceInformation)['abi'];
type IOuterSpaceFleetsCommit = (typeof Artifact_IOuterSpaceFleetsCommit)['abi'];
type IOuterSpaceFleetsReveal = (typeof Artifact_IOuterSpaceFleetsReveal)['abi'];
type IOuterSpaceStaking = (typeof Artifact_IOuterSpaceStaking)['abi'];

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
		abi: IOuterSpaceInformation;
		publicClient: PublicClient;
		walletClient: WalletClient | undefined;
	};
	fleetsCommitContract: {
		address: Address;
		abi: IOuterSpaceFleetsCommit;
		publicClient: PublicClient;
		walletClient: WalletClient | undefined;
	};
	fleetsRevealContract: {
		address: Address;
		abi: IOuterSpaceFleetsReveal;
		publicClient: PublicClient;
		walletClient: WalletClient | undefined;
	};
	stakingContract: {
		address: Address;
		abi: IOuterSpaceStaking;
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
		abi: Artifact_IOuterSpaceInformation.abi as IOuterSpaceInformation,
		publicClient,
		walletClient,
	};

	const fleetsCommitContract = {
		address: gameContract,
		abi: Artifact_IOuterSpaceFleetsCommit.abi as IOuterSpaceFleetsCommit,
		publicClient,
		walletClient,
	};

	const fleetsRevealContract = {
		address: gameContract,
		abi: Artifact_IOuterSpaceFleetsReveal.abi as IOuterSpaceFleetsReveal,
		publicClient,
		walletClient,
	};

	const stakingContract = {
		address: gameContract,
		abi: Artifact_IOuterSpaceStaking.abi as IOuterSpaceStaking,
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
