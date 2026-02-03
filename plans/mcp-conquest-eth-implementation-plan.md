# MCP Conquest.eth Server - Implementation Plan

## Quick Start / Context Restoration

**Purpose**: This section helps restore context in a new conversation to begin implementation.

**Project Status**: Architecture design complete, ready to begin Phase 1 implementation.

**Current State**:
- Repository: `mcp-conquest-eth-v0`
- Existing files: [`src/index.ts`](../src/index.ts:1), [`src/cli.ts`](../src/cli.ts:1), [`src/types.ts`](../src/types.ts:1) (empty)
- Package: MCP server skeleton with viem and mcp-ethereum integration
- Conquest contracts library: Available at [`../conquest-eth-v0-contracts/js/`](../conquest-eth-v0-contracts/js/index.ts:1)

**Contract ABIs Location**:
- All ABIs are in [`conquest-eth-v0-contracts/generated/abis/index.ts`](../conquest-eth-v0-contracts/generated/abis/index.ts:1)
- Key interfaces to import:
  - `IOuterSpaceInformation` - [`conquest-eth-v0-contracts/generated/abis/IOuterSpaceInformation.ts`](../conquest-eth-v0-contracts/generated/abis/IOuterSpaceInformation.ts:1)
  - `IOuterSpaceFleetsCommit` - [`conquest-eth-v0-contracts/generated/abis/IOuterSpaceFleetsCommit.ts`](../conquest-eth-v0-contracts/generated/abis/IOuterSpaceFleetsCommit.ts:1)
  - `IOuterSpaceFleetsReveal` - [`conquest-eth-v0-contracts/generated/abis/IOuterSpaceFleetsReveal.ts`](../conquest-eth-v0-contracts/generated/abis/IOuterSpaceFleetsReveal.ts:1)
  - `IOuterSpaceStaking` - [`conquest-eth-v0-contracts/generated/abis/IOuterSpaceStaking.ts`](../conquest-eth-v0-contracts/generated/abis/IOuterSpaceStaking.ts:1)

**Next Immediate Steps** (Phase 1: Core Infrastructure):
1. Create storage interface in [`src/storage/interface.ts`](src/storage/interface.ts:1)
2. Create JSON storage implementation in [`src/storage/json-storage.ts`](src/storage/json-storage.ts:1)
3. Create SpaceInfo wrapper in [`src/contracts/space-info.ts`](src/contracts/space-info.ts:1)
4. Create contract client setup in [`src/contracts/clients.ts`](src/contracts/clients.ts:1)
5. Update [`package.json`](../package.json:1) to include local dependency: `"conquest-eth-v0-contracts": "workspace:*"`
6. Create type definitions in [`src/types/fleet.ts`](src/types/fleet.ts:1)
7. Create type definitions in [`src/types/planet.ts`](src/types/planet.ts:1)
8. Update [`src/types.ts`](../src/types.ts:1) with shared types
9. Update [`src/cli.ts`](../src/cli.ts:1) to support `--storage` option

**Key Design Decisions Made**:
- Use abstract storage interface (JSON first, SQLite optional later)
- Storage directory: Default to `${cwd}/data`, configurable via CLI `--storage-path`
- Track both pending fleets AND pending exits
- Use batch contract functions: `acquireMultipleViaNativeTokenAndStakingToken`, `exitMultipleFor`
- No The Graph dependency - query contracts directly
- `getMyPlanets` uses center+radius search (future: maintain player index)

**9 MCP Tools to Implement**:
1. [`acquirePlanets`](#tool-1-acquireplanets) - Batch acquire planets
2. [`sendFleet`](#tool-2-sendfleet) - Commit fleet movement
3. [`resolveFleet`](#tool-3-resolvefleet) - Reveal fleet (resolve combat)
4. [`exitPlanets`](#tool-4-exitplanets) - Batch exit planets
5. [`getPendingExits`](#tool-5-getpendingexits) - Query pending exits
6. [`verifyExitStatus`](#tool-6-verifyexitstatus) - Check if exit interrupted
7. [`getMyPlanets`](#tool-7-getmyplanets) - Get owned planets in radius
8. [`getPlanetsAround`](#tool-8-getplanetsaround) - Get planets in radius
9. [`getPendingFleets`](#tool-9-getpendingfleets) - Query pending fleets

---

## Contract Interface Details

### IOuterSpaceInformation

**Location**: [`conquest-eth-v0-contracts/generated/abis/IOuterSpaceInformation.ts`](../conquest-eth-v0-contracts/generated/abis/IOuterSpaceInformation.ts:1)

**Key Functions**:
```typescript
// Get game configuration
function getConfig() readonly returns (Config);

// Batch query planet states
function getPlanetStates(locationIds readonly locationIds[]) readonly returns (ExternalPlanet[]);

// Get discovered planets range
function getDiscovered() readonly returns (minLocation, maxLocation);
```

**Config Structure**:
```typescript
interface Config {
  genesis: bigint;              // Genesis timestamp
  resolveWindow: bigint;        // Window for resolving fleets
  timePerDistance: bigint;      // Travel time multiplier
  exitDuration: bigint;         // Exit process duration (7 days)
  // ... additional config fields
}
```

### IOuterSpaceFleetsCommit

**Location**: [`conquest-eth-v0-contracts/generated/abis/IOuterSpaceFleetsCommit.ts`](../conquest-eth-v0-contracts/generated/abis/IOuterSpaceFleetsCommit.ts:1)

**Key Functions**:
```typescript
// Commit a fleet movement
function send(from readonly location, quantity uint256, toHash bytes32) payable returns (bytes32);

// Commit fleet for another address (advanced)
function sendFor(launch readonly Launch) payable returns (bytes32);
```

### IOuterSpaceFleetsReveal

**Location**: [`conquest-eth-v0-contracts/generated/abis/IOuterSpaceFleetsReveal.ts`](../conquest-eth-v0-contracts/generated/abis/IOuterSpaceFleetsReveal.ts:1)

**Key Functions**:
```typescript
// Resolve a fleet (reveal phase)
function resolveFleet(fleetId bytes32, resolution readonly FleetResolution) returns (CombatOutcome);
```

**FleetResolution Struct**:
```typescript
interface FleetResolution {
  from: bigint;              // Source planet location
  to: bigint;                // Destination planet location
  distance: bigint;          // Distance between planets
  arrivalTimeWanted: bigint; // Preferred arrival time
  gift: boolean;             // Whether this is a gift
  specific: `0x${string}`;   // Specific target address
  secret: `0x${string}`;     // The secret used to generate the hash
  fleetSender: `0x${string}`; // Address that sent the fleet
  operator: `0x${string}`;   // Address that committed the transaction
}
```

### IOuterSpaceStaking

**Location**: [`conquest-eth-v0-contracts/generated/abis/IOuterSpaceStaking.ts`](../conquest-eth-v0-contracts/generated/abis/IOuterSpaceStaking.ts:1)

**Key Functions**:
```typescript
// Acquire (stake) multiple planets
function acquireMultipleViaNativeTokenAndStakingToken(
  locations readonly location[],
  amountToMint uint256,
  tokenAmount uint256
) payable;

// Exit (unstake) multiple planets
function exitMultipleFor(owner readonly address, locations readonly location[]);
```

---

## Contracts Library Exports

**Location**: [`conquest-eth-v0-contracts/js/index.ts`](../conquest-eth-v0-contracts/js/index.ts:1)

**Key Exports**:
```typescript
export { SpaceInfo } from './model/SpaceInfo.js';
export * from './types.js';  // PlanetInfo, PlanetLocation, PlanetState, Statistics, TxStatus
export { locationToXY, xyToLocation, nextInSpiral } from './util/location.js';
```

**SpaceInfo Class**:
- Location: [`conquest-eth-v0-contracts/js/model/SpaceInfo.ts`](../conquest-eth-v0-contracts/js/model/SpaceInfo.ts:1)
- Large class (1006 lines) with deterministic planet calculations
- Constructor requires config params from contract `getConfig()`
- Methods: `getPlanet(location)`, `distance(loc1, loc2)`, `travelTime(distance)`, `simulateCombat()`

---

## Type Definitions

### Fleet Types

**File**: [`src/types/fleet.ts`](src/types/fleet.ts:1)

```typescript
import type { Address } from 'viem';

export interface PendingFleet {
  fleetId: string;           // Computed from toHash, from, fleetSender, operator
  fromPlanetId: bigint;      // Source planet location
  toPlanetId: bigint;        // Destination planet location (hidden during commit)
  quantity: number;          // Number of spaceships
  secret: `0x${string}`;     // Random secret for hash commitment
  gift: boolean;             // Whether this is a gift (no combat)
  specific: `0x${string}`;   // Specific target address (advanced feature)
  arrivalTimeWanted: bigint; // Preferred arrival time (advanced feature)
  fleetSender: Address;      // Address that sent the fleet
  operator: Address;         // Address that committed the transaction
  committedAt: number;       // Timestamp of commit transaction
  estimatedArrivalTime: number; // Estimated arrival time
  resolved: boolean;         // Whether fleet has been revealed/resolved
  resolvedAt?: number;       // Timestamp of resolution
}

export interface FleetResolution {
  from: bigint;              // Source planet location
  to: bigint;                // Destination planet location
  distance: bigint;          // Distance between planets
  arrivalTimeWanted: bigint; // Preferred arrival time
  gift: boolean;             // Whether this is a gift
  specific: Address;         // Specific target address
  secret: `0x${string}`;     // The secret used to generate the hash
  fleetSender: Address;      // Address that sent the fleet
  operator: Address;         // Address that committed the transaction
}
```

### Planet Types

**File**: [`src/types/planet.ts`](src/types/planet.ts:1)

```typescript
import type { Address } from 'viem';
import type { PlanetInfo, ExternalPlanet } from 'conquest-eth-v0-contracts';

export interface PendingExit {
  planetId: bigint;          // Planet location ID
  player: Address;           // Player who initiated the exit
  exitStartTime: number;     // Timestamp when exit was initiated
  exitDuration: number;      // Duration of exit process (typically 7 days)
  exitCompleteTime: number;  // When exit will complete
  numSpaceships: number;     // Spaceships on planet at exit start
  owner: Address;            // Current owner (may change due to attacks)
  completed: boolean;        // Whether exit has completed
  interrupted: boolean;      // Whether exit was interrupted by attack
  lastCheckedAt: number;     // Last time status was verified against contract
}

export interface PlanetWithDistance {
  info: PlanetInfo;
  state?: ExternalPlanet;
  distance: number;
  hasPendingExit?: boolean;
  exitInfo?: {
    exitStartTime: number;
    exitCompleteTime: number;
    timeUntilComplete: number;
  };
}
```

### Shared Types

**File**: [`src/types.ts`](../src/types.ts:1)

```typescript
export interface StorageConfig {
  type: 'json' | 'sqlite';
  dataDir?: string;  // Default: `${cwd}/data`
}

export interface ContractClients {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  gameContract: `0x${string}`;
}

export type { PendingFleet, FleetResolution } from './types/fleet.js';
export type { PendingExit, PlanetWithDistance } from './types/planet.js';
```

---

## Storage Interface

**File**: [`src/storage/interface.ts`](src/storage/interface.ts:1)

```typescript
import type { Address } from 'viem';
import type { PendingFleet, PendingExit } from '../types/fleet.js';
import type { PendingExit as PendingExitType } from '../types/planet.js';

export interface FleetStorage {
  // Fleet operations
  saveFleet(fleet: PendingFleet): Promise<void>;
  getFleet(fleetId: string): Promise<PendingFleet | null>;
  getPendingFleetsBySender(sender: Address): Promise<PendingFleet[]>;
  getResolvableFleets(): Promise<PendingFleet[]>;
  markResolved(fleetId: string, resolvedAt: number): Promise<void>;
  cleanupOldResolvedFleets(olderThan: number): Promise<void>;
  getAllFleets(): Promise<PendingFleet[]>;
  
  // Exit operations
  savePendingExit(exit: PendingExitType): Promise<void>;
  getPendingExit(planetId: bigint): Promise<PendingExitType | null>;
  getPendingExitsByPlayer(player: Address): Promise<PendingExitType[]>;
  updateExitStatus(planetId: bigint, updates: Partial<PendingExitType>): Promise<void>;
  markExitCompleted(planetId: bigint, completedAt: number): Promise<void>;
  markExitInterrupted(planetId: bigint, interruptedAt: number, newOwner: Address): Promise<void>;
  cleanupOldCompletedExits(olderThan: number): Promise<void>;
  getAllPendingExits(): Promise<PendingExitType[]>;
}
```

---

## JSON Storage Implementation

**File**: [`src/storage/json-storage.ts`](src/storage/json-storage.ts:1)

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import type { Address } from 'viem';
import type { FleetStorage } from './interface.js';
import type { PendingFleet, PendingExit } from '../types/fleet.js';

interface StorageData {
  fleets: Record<string, PendingFleet>;
  exits: Record<string, PendingExit>;
}

export class JsonFleetStorage implements FleetStorage {
  private dataPath: string;
  private data: StorageData;

  constructor(dataDir: string = './data') {
    this.dataPath = path.join(dataDir, 'conquest-data.json');
    this.data = { fleets: {}, exits: {} };
  }

  async initialize(): Promise<void> {
    // Load from disk or create new
    try {
      const content = await fs.readFile(this.dataPath, 'utf-8');
      this.data = JSON.parse(content);
    } catch (error) {
      // File doesn't exist, create new
      await this.save();
    }
  }

  private async save(): Promise<void> {
    await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
  }

  // Implement all FleetStorage interface methods...
}
```

---

## Contract Clients Setup

**File**: [`src/contracts/clients.ts`](src/contracts/clients.ts:1)

```typescript
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Chain, Address, PublicClient, WalletClient } from 'viem';
import { 
  IOuterSpaceInformation, 
  IOuterSpaceFleetsCommit,
  IOuterSpaceFleetsReveal,
  IOuterSpaceStaking
} from 'conquest-eth-v0-contracts/generated/abis';

export function createContractClients(
  chain: Chain,
  rpcUrl: string,
  gameContract: Address,
  privateKey?: Address
) {
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
    abi: IOuterSpaceInformation,
    publicClient,
    walletClient,
  };

  const fleetsCommitContract = {
    address: gameContract,
    abi: IOuterSpaceFleetsCommit,
    publicClient,
    walletClient,
  };

  const fleetsRevealContract = {
    address: gameContract,
    abi: IOuterSpaceFleetsReveal,
    publicClient,
    walletClient,
  };

  const stakingContract = {
    address: gameContract,
    abi: IOuterSpaceStaking,
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
```

---

## SpaceInfo Wrapper

**File**: [`src/contracts/space-info.ts`](src/contracts/space-info.ts:1)

```typescript
import { SpaceInfo } from 'conquest-eth-v0-contracts';
import type { PublicClient } from 'viem';
import type { Config } from 'conquest-eth-v0-contracts/generated/abis/IOuterSpaceInformation';

export async function createSpaceInfo(
  publicClient: PublicClient,
  gameContract: `0x${string}`
): Promise<SpaceInfo> {
  // Fetch config from contract
  const config = await publicClient.readContract({
    address: gameContract,
    abi: /* IOuterSpaceInformation ABI */,
    functionName: 'getConfig',
  });

  // Create SpaceInfo instance with config
  return new SpaceInfo({
    genesis: config.genesis,
    resolveWindow: config.resolveWindow,
    timePerDistance: config.timePerDistance,
    exitDuration: config.exitDuration,
    // ... other config fields
  });
}
```

---

## CLI Updates

**File**: [`src/cli.ts`](../src/cli.ts:1)

Add new option:
```typescript
.option('--storage <type>', 'Storage backend: json or sqlite', 'json')
.option('--storage-path <path>', 'Path to storage directory', './data')
```

---

## Implementation Phases

### Phase 1: Core Infrastructure

**Files to create**:
1. [`src/storage/interface.ts`](src/storage/interface.ts:1) - Storage interface
2. [`src/storage/json-storage.ts`](src/storage/json-storage.ts:1) - JSON implementation
3. [`src/contracts/space-info.ts`](src/contracts/space-info.ts:1) - SpaceInfo wrapper
4. [`src/contracts/clients.ts`](src/contracts/clients.ts:1) - Contract client setup
5. [`src/types/fleet.ts`](src/types/fleet.ts:1) - Fleet type definitions
6. [`src/types/planet.ts`](src/types/planet.ts:1) - Planet type definitions

**Files to modify**:
1. [`src/types.ts`](../src/types.ts:1) - Add shared types
2. [`package.json`](../package.json:1) - Add local dependency
3. [`src/cli.ts`](../src/cli.ts:1) - Add storage options

### Phase 2: Fleet Management

**Files to create**:
1. [`src/managers/fleet-manager.ts`](src/managers/fleet-manager.ts:1) - Fleet management logic
2. [`src/utils/hash.ts`](src/utils/hash.ts:1) - Hash utilities (toHash, fleetId)
3. [`src/utils/time.ts`](src/utils/time.ts:1) - Time utilities

### Phase 3: Planet Management

**Files to create**:
1. [`src/managers/planet-manager.ts`](src/managers/planet-manager.ts:1) - Planet management logic

### Phase 4: MCP Tools Implementation

**Files to create**:
1. [`src/tools/acquire-planets.ts`](src/tools/acquire-planets.ts:1)
2. [`src/tools/send-fleet.ts`](src/tools/send-fleet.ts:1)
3. [`src/tools/resolve-fleet.ts`](src/tools/resolve-fleet.ts:1)
4. [`src/tools/exit-planets.ts`](src/tools/exit-planets.ts:1)
5. [`src/tools/get-pending-exits.ts`](src/tools/get-pending-exits.ts:1)
6. [`src/tools/verify-exit-status.ts`](src/tools/verify-exit-status.ts:1)
7. [`src/tools/get-my-planets.ts`](src/tools/get-my-planets.ts:1)
8. [`src/tools/get-planets-around.ts`](src/tools/get-planets-around.ts:1)
9. [`src/tools/get-pending-fleets.ts`](src/tools/get-pending-fleets.ts:1)

**Files to modify**:
1. [`src/index.ts`](../src/index.ts:1) - Register all tools

### Phase 5: Integration & Testing

**Tasks**:
1. End-to-end testing
2. Error handling improvements
3. Documentation

---

## File Structure

```
mcp-conquest-eth/
├── plans/
│   └── mcp-conquest-eth-implementation-plan.md  # This file
├── src/
│   ├── cli.ts                            # CLI entry point
│   ├── index.ts                          # MCP server setup
│   ├── types.ts                          # Shared type definitions
│   ├── storage/
│   │   ├── interface.ts                  # Storage interface
│   │   ├── json-storage.ts               # JSON implementation
│   │   └── sqlite-storage.ts             # SQLite implementation (future)
│   ├── managers/
│   │   ├── fleet-manager.ts              # Fleet business logic
│   │   └── planet-manager.ts             # Planet business logic
│   ├── contracts/
│   │   ├── clients.ts                    # Contract clients setup
│   │   └── space-info.ts                 # SpaceInfo wrapper
│   ├── types/
│   │   ├── fleet.ts                      # Fleet type definitions
│   │   └── planet.ts                     # Planet type definitions
│   ├── tools/
│   │   ├── acquire-planets.ts            # acquirePlanets tool
│   │   ├── send-fleet.ts                 # sendFleet tool
│   │   ├── resolve-fleet.ts              # resolveFleet tool
│   │   ├── exit-planets.ts               # exitPlanets tool
│   │   ├── get-pending-exits.ts          # getPendingExits tool
│   │   ├── verify-exit-status.ts         # verifyExitStatus tool
│   │   ├── get-my-planets.ts             # getMyPlanets tool
│   │   ├── get-planets-around.ts         # getPlanetsAround tool
│   │   └── get-pending-fleets.ts         # getPendingFleets tool
│   └── utils/
│       ├── hash.ts                       # Hash utilities
│       └── time.ts                       # Time utilities
├── data/
│   └── conquest-data.json               # Pending fleets and exits storage (JSON)
├── conquest-eth-v0-contracts/
│   └── js/                              # Local contracts library
├── package.json
├── tsconfig.json
└── README.md
```

---

## Implementation Order Checklist

1. [ ] Create [`src/types/fleet.ts`](src/types/fleet.ts:1) - Fleet type definitions
2. [ ] Create [`src/types/planet.ts`](src/types/planet.ts:1) - Planet type definitions
3. [ ] Update [`src/types.ts`](../src/types.ts:1) - Add shared types
4. [ ] Create [`src/storage/interface.ts`](src/storage/interface.ts:1) - Storage interface
5. [ ] Create [`src/storage/json-storage.ts`](src/storage/json-storage.ts:1) - JSON implementation
6. [ ] Create [`src/contracts/clients.ts`](src/contracts/clients.ts:1) - Contract client setup
7. [ ] Create [`src/contracts/space-info.ts`](src/contracts/space-info.ts:1) - SpaceInfo wrapper
8. [ ] Update [`package.json`](../package.json:1) - Add local dependency
9. [ ] Update [`src/cli.ts`](../src/cli.ts:1) - Add storage options
10. [ ] Create [`src/utils/hash.ts`](src/utils/hash.ts:1) - Hash utilities
11. [ ] Create [`src/utils/time.ts`](src/utils/time.ts:1) - Time utilities
12. [ ] Create [`src/managers/fleet-manager.ts`](src/managers/fleet-manager.ts:1) - Fleet manager
13. [ ] Create [`src/managers/planet-manager.ts`](src/managers/planet-manager.ts:1) - Planet manager
14. [ ] Create [`src/tools/acquire-planets.ts`](src/tools/acquire-planets.ts:1) - Tool
15. [ ] Create [`src/tools/send-fleet.ts`](src/tools/send-fleet.ts:1) - Tool
16. [ ] Create [`src/tools/resolve-fleet.ts`](src/tools/resolve-fleet.ts:1) - Tool
17. [ ] Create [`src/tools/exit-planets.ts`](src/tools/exit-planets.ts:1) - Tool
18. [ ] Create [`src/tools/get-pending-exits.ts`](src/tools/get-pending-exits.ts:1) - Tool
19. [ ] Create [`src/tools/verify-exit-status.ts`](src/tools/verify-exit-status.ts:1) - Tool
20. [ ] Create [`src/tools/get-my-planets.ts`](src/tools/get-my-planets.ts:1) - Tool
21. [ ] Create [`src/tools/get-planets-around.ts`](src/tools/get-planets-around.ts:1) - Tool
22. [ ] Create [`src/tools/get-pending-fleets.ts`](src/tools/get-pending-fleets.ts:1) - Tool
23. [ ] Update [`src/index.ts`](../src/index.ts:1) - Register all tools

---

## Dependencies

### package.json Update Required

Add to dependencies:
```json
{
  "dependencies": {
    "conquest-eth-v0-contracts": "workspace:*",
    // ... existing dependencies
  }
}
```

---

## CLI Command

```bash
mcp-conquest-eth \
  --rpc-url <RPC_URL> \
  --game-contract <CONTRACT_ADDRESS> \
  --ethereum \                  # Optional: include mcp-ethereum tools
  --storage <json|sqlite> \     # Optional: storage backend (default: json)
  --storage-path <path>         # Optional: storage directory (default: ./data)