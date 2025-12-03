# DePoker2 ♠️ – Local Settlement & Reputation Demo

DePoker2 is a **smart-contract–based settlement and reputation system** for friendly poker games.

- Players buy in with ETH into an on-chain pool  
- After the (offline / online) game, everyone **votes on the winner**  
- The contract enforces a **strict-majority rule** and pays out the pot  
- A simple **reputation score** records how often each address votes “correctly” and/or wins

> ⚠️ DePoker2 is a **course / research prototype**, not audited, and **must not** be used for real-money gambling on mainnet.  
> Use only on local or test networks with test ETH.

---

## 1. Repository Layout

Recommended structure for this repo (`DePoker`):

~~~text
DePoker/
├── contracts/
│   └── DePoker2.sol
├── scripts/
│   ├── deploy_depoker2.js
│   ├── demo_depoker2_round_v1.js   # scripted demo – everyone votes correctly
│   └── demo_depoker2_round_v2.js   # scripted demo – random winners + noisy voters
├── test/
│   └── depoker2.js                 # Hardhat test suite
├── deployments/
│   └── localhost-DePoker2.json     # Saved deployment info (address, etc.)
├── docs/
│   ├── DePoker2-local-test.md           # Local multi-player scripted test guide
│   └── DePoker2-3players-local-test.md  # 3 players / 3 terminals manual guide
├── hardhat.config.js
└── README.md                        # This file
~~~

---

## 2. Prerequisites

Please install:

- **Node.js ≥ 20** (LTS recommended)  
- **npm** (comes with Node.js)  
- **git**

Check versions:

~~~bash
node -v
npm -v
git --version
~~~

If Node.js is not installed:

Install via `nvm` (Node Version Manager), then:

  ~~~bash
  nvm install --lts
  nvm use --lts
  ~~~

---

## 3. Install & Build

Clone the repo:

~~~bash
git clone https://github.com/cauhenrygu/DePoker.git
cd DePoker
~~~

Install dependencies:

~~~bash
npm install
~~~

Compile contracts:

~~~bash
npx hardhat compile
~~~

---

## 4. Contract Overview – DePoker2.sol

`DePoker2` extends the original single-room DePoker idea with:

### 4.1 Multiple Rooms

- Rooms are stored in a mapping `rooms[roomId]`.
- `roomId` is an incrementing counter `nextRoomId` (0, 1, 2, …).
- Each room stores:
  - `creator` – address of the room owner
  - `buyIn` – fixed ETH amount each player must send
  - `playerCount`
  - `totalPool`
  - `started` / `settled` flags
  - `winner` – final winner address
  - `players[]` and helper mappings (e.g. joined / voted)

### 4.2 Core Functions

- `createRoom(uint256 buyIn)`
  - Creates a new room with given `buyIn`.
  - Returns the newly assigned `roomId` (also emitted in `RoomCreated` event).
- `joinRoom(uint256 roomId)` (payable)
  - Player sends exactly `buyIn` ETH.
  - Checks:
    - Room exists and is **not** settled.
    - Room is **not** started yet.
    - `msg.value == buyIn`.
    - Same address cannot join twice.
  - Updates `playerCount` and `totalPool`.
- `startRoom(uint256 roomId)`
  - Only `creator` can call.
  - Requires at least 2 players.
  - Locks the room for voting & settlement.
- `voteWinner(uint256 roomId, address candidate)`
  - Only joined players can vote.
  - Each address can vote **once per room**.
  - `candidate` must be one of the room’s players.
  - Votes are stored in per-room mappings.
- `finalize(uint256 roomId, address declaredWinner)`
  - Only `creator` can call.
  - Counts votes, checks that `declaredWinner` has a **strict majority** (> 50%).
  - Transfers the entire `totalPool` to the winner.
  - Marks room as `settled = true`.

### 4.3 Reputation System

- `mapping(address => int256) public reputation;`
- On `finalize`:
  - Every player who voted for the actual winner gets `+1` reputation.
  - Players who voted incorrectly may get `0` or a penalty (depending on your current version).
  - The winner may also receive additional reputation if desired.
- Anyone can query:
  - `getReputation(address player)` – returns current reputation score for that address.

Reputation naturally accumulates across **multiple rooms**, as long as the same wallet address is reused.

---

## 5. Start Local Hardhat Node

In **Terminal 1**:

~~~bash
cd DePoker
npx hardhat node
~~~

You should see output listing 20 test accounts, each with **10,000 ETH** (test ETH).

> ✅ Keep Terminal 1 open and running the node the whole time.

---

## 6. Deploy DePoker2 Locally

Open **Terminal 2**:

~~~bash
cd DePoker
npx hardhat run --network localhost scripts/deploy_depoker2.js
~~~

Typical output:

~~~text
DePoker2 deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Saved deployment info to /home/you/DePoker/deployments/localhost-DePoker2.json
~~~

- The script deploys `DePoker2` to the local Hardhat node.
- The deployed address is also saved into `deployments/localhost-DePoker2.json`, so other scripts can read it automatically.

---

## 7. Automated Tests

The test file `test/depoker2.js` covers (examples):

- Room creation & initial state
- Player joins & pool updates
- Start-room permissions & minimum player checks
- Full game flow: create → join → start → vote → finalize → payout
- Reputation updates for correct vs incorrect voting (depending on version)

Run tests in **Terminal 2** (or any new terminal, while the node is running):

~~~bash
cd DePoker
npx hardhat test test/depoker2.js
~~~

Expected result (example):

~~~text
  DePoker2
    ✓ creates a room with correct buy-in and initial state
    ✓ lets players join and updates pool
    ✓ only creator can start and room must have at least 2 players
    ✓ runs a full game and updates reputation

  4 passing (XXXms)
~~~

---

## 8. Demo Scripts

DePoker2 comes with two scripted demo rounds:

- `demo_depoker2_round_v1.js`
  - Deterministic: **fixed winner**, everyone votes correctly.
  - Good for sanity check that pool and reputation all behave as expected.
- `demo_depoker2_round_v2.js`
  - **Random winner** each time.
  - 10 players join the room (owner + 9 others).
  - For each round:
    - 8 players vote correctly for the true winner.
    - 2 players just vote for themselves.  
  - After several runs, reputation scores diverge and look more “realistic”.

### 8.1 Demo v1 – All Honest Voters

In **Terminal 2** (node still running in Terminal 1):

~~~bash
cd DePoker
# Make sure contract is deployed:
npx hardhat run --network localhost scripts/deploy_depoker2.js

# Run the simple demo:
npx hardhat run --network localhost scripts/demo_depoker2_round_v1.js
~~~

Sample output (simplified):

~~~text
Network: localhost, using 10 participants
Using DePoker2 at: 0x5FbD...
Creating room with buy-in = 1 ETH ...
Room created, id = 0
Player 0 (...) joining room ...
...
After joins: playerCount = 10 pot = 10.0 ETH
Starting room ...
Player i (...) voting for WINNER ...
...
Finalizing room ...
Room settled = true winner = 0x....
Reputation scores:
  Player 0 (...): rep = 1
  Player 1 (...): rep = 1
  ...
~~~

### 8.2 Demo v2 – Random Winner + Noisy Voters

Run:

~~~bash
cd DePoker
# (Optional) re-deploy if needed:
npx hardhat run --network localhost scripts/deploy_depoker2.js

# Run the stochastic demo:
npx hardhat run --network localhost scripts/demo_depoker2_round_v2.js
~~~

Each run will:

1. Read the deployed DePoker2 address from `deployments/localhost-DePoker2.json`.  
2. Create a new room with `roomId = nextRoomId`.  
3. Join 10 players (owner + 9 others).  
4. Randomly pick a winner index between 0 and 9.  
5. Let 8 players vote correctly, 2 players vote for themselves.  
6. Call `finalize` and print:
   - Final `winner` address
   - Updated reputation score for each player

You can run this script repeatedly:

~~~bash
npx hardhat run --network localhost scripts/demo_depoker2_round_v2.js
npx hardhat run --network localhost scripts/demo_depoker2_round_v2.js
# ...
~~~

As long as the local node stays open, `roomId` will keep increasing (0, 1, 2, 3, …) and reputations will accumulate across rounds.

---

## 9. Docs Overview

The `docs/` folder contains more detailed guides:

### 9.1 `docs/DePoker2-local-test.md`

- Step-by-step **local scripted test guide**.
- Shows how to:
  - Start Hardhat node
  - Deploy DePoker2
  - Run the demo scripts
  - Inspect room state and reputation changes

Suitable for: **quick local smoke test** with everything happening from one terminal / machine.

### 9.2 `docs/DePoker2-3players-local-test.md`

- Manual **3-player / 3-terminal** test:
  - Terminal 1: room owner (creates room, starts room, finalizes)
  - Terminal 2: Player 1 (joins, votes)
  - Terminal 3: Player 2 (joins, votes)
- Reproduces the “owner + p1 + p2” workflow you tested by hand:
  - `createRoom`
  - each address `joinRoom`
  - `startRoom`
  - each address `voteWinner`
  - `finalize`
  - check `getRoom` and `getReputation` for all three

Suitable for: **live demo** where three people each control their own terminal / wallet.

---

## 10. Development Notes & Future Work

- Tech stack:
  - Solidity 0.8.x
  - Hardhat (JavaScript)
  - ethers.js v6
- Designed primarily for **local Hardhat**; can be ported to testnets with proper configuration.
- Potential extensions:
  - More sophisticated reputation scoring (penalties, decay, etc.)
  - Anti-collusion rules and multi-winner settlements
  - Frontend (React + ethers.js) for real-time voting UI
  - Off-chain sign-in / DID integration so “real people” can be mapped to addresses

---

## 11. Disclaimer

DePoker2 is an **educational prototype** created for a Web3 / blockchain course.

- Not audited  
- No guarantees about security or economic soundness  
- Not for real-money gambling or production use  

Please use it only:

- On local Hardhat nodes, or  
- On public test networks with **test ETH only**.
