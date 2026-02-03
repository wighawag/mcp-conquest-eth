import {SpaceInfo} from '../../conquest-eth-v0-contracts/js/index.js';
import type {PublicClient} from 'viem';
import {Artifact_IOuterSpaceInformation} from '../../conquest-eth-v0-contracts/generated/artifacts/IOuterSpaceInformation.js';
import type {ContractConfig} from '../types.js';

export async function createSpaceInfo(
	publicClient: PublicClient,
	gameContract: `0x${string}`,
): Promise<{spaceInfo: SpaceInfo; contractConfig: ContractConfig}> {
	// Fetch config from contract
	const config = await publicClient.readContract({
		address: gameContract,
		abi: Artifact_IOuterSpaceInformation.abi,
		functionName: 'getConfig',
	});

	const contractConfig: ContractConfig = {
		genesis: BigInt(config.genesis),
		resolveWindow: BigInt(config.resolveWindow),
		timePerDistance: BigInt(config.timePerDistance),
		exitDuration: BigInt(config.exitDuration),
		acquireNumSpaceships: Number(config.acquireNumSpaceships),
	};

	// Create SpaceInfo instance with config
	const spaceInfo = new SpaceInfo({
		genesis: config.genesis as `0x${string}`,
		resolveWindow: Number(config.resolveWindow),
		timePerDistance: Number(config.timePerDistance),
		exitDuration: Number(config.exitDuration),
		acquireNumSpaceships: Number(config.acquireNumSpaceships),
		productionSpeedUp: Number(config.productionSpeedUp),
		productionCapAsDuration: Number(config.productionCapAsDuration),
		upkeepProductionDecreaseRatePer10000th: Number(config.upkeepProductionDecreaseRatePer10000th),
		fleetSizeFactor6: Number(config.fleetSizeFactor6),
		giftTaxPer10000: Number(config.giftTaxPer10000),
		stakeRange: config.stakeRange,
		stakeMultiplier10000th: Number(config.stakeMultiplier10000th),
		bootstrapSessionEndTime: Number(config.bootstrapSessionEndTime),
		infinityStartTime: Number(config.infinityStartTime),
	});

	return {spaceInfo, contractConfig};
}