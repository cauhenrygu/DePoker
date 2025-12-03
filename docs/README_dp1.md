# DePoker ♠️ – Decentralized Poker Settlement Demo

DePoker is a **smart-contract–based settlement system** for friendly Texas Hold'em games.

In a typical student / friends’ poker night:

- Everyone brings cash / Venmo / WeChat…
- Someone becomes the “human settlement engine”
- Newcomers / friends-of-friends may not be fully trusted
- History is hard to track (who won / lost how much over time)

DePoker aims to provide a **transparent, auditable, on-chain settlement layer**:

- Players **buy in with ETH** into a shared on-chain pool
- After the offline game, players **vote on the winner**
- The contract enforces a **strict majority rule** and pays out the entire pool
- All logic is encoded in Solidity and tested via Hardhat

> ⚠️ This is a **course project demo** and is **not** intended for real-money gambling on mainnet.

---

## Features (Current MVP)

Smart contract `DePoker.sol` (deployed on a local Hardhat network) supports:

- `createRoom(buyIn)`
  - Owner creates a new poker room
  - Sets a fixed buy-in amount (e.g. `1 ETH` or `0.5 ETH`)
  - Room has an ID (first room is `roomId = 0`)

- `joinRoom(roomId)` (payable)
  - Players join by sending exactly `buyIn` ETH
  - The contract tracks:
    - number of players
    - total pool (`playerCount * buyIn`)
  - Prevents:
    - joining after the room is started / settled
    - joining with incorrect amount
    - joining the same room twice

- `startRoom(roomId)`
  - Can only be called by the room creator
  - Requires at least **2 players**
  - Locks the room for voting & settlement

- `voteWinner(roomId, candidate)`
  - Each joined player can vote **once** for any player address in the room
  - Votes are stored on-chain

- `finalize(roomId, declaredWinner)`
  - Only the room creator can call it
  - The contract:
    - Counts votes for all candidates
    - Ensures `declaredWinner` has a **strict majority** (> 50% of votes)
    - Transfers the **entire ETH pool** to the winner
    - Marks the room as `settled = true`
  - If no strict majority, the call reverts (e.g. `"no majority for candidate"`)

All of this is covered by automated tests and a demo script.

---

## Tech Stack

- **Language:** Solidity `0.8.x`
- **Framework:** Hardhat (JavaScript project)
- **Testing:** Mocha + Chai via `@nomicfoundation/hardhat-toolbox`
- **Runtime:** Node.js (tested with modern LTS, e.g. 20+)
- **Local chain:** `npx hardhat node`

---

## Project Structure

Key files in this repository:

```text
.
├── contracts/
│   └── DePoker.sol          # Core smart contract
├── scripts/
│   ├── deploy_depoker.js    # Deploys the DePoker contract to a network
│   └── demo_round.js        # End-to-end demo: one full game round
├── test/
│   └── depoker.js           # Hardhat test suite (4 tests, all passing)
├── hardhat.config.js        # Hardhat configuration
└── README.md                # This file
```

---

## Prerequisites

Make sure you have:

- **Node.js** ≥ 20 (LTS recommended)
- **npm** (comes with Node)
- **git** (for cloning the repo)

You can check your versions with:

```bash
node -v
npm -v
git --version
```

---

## Install & Build

Clone the repo (example):

```bash
git clone https://github.com/cauhenrygu/DePoker.git
cd DePoker
```

Install dependencies:

```bash
npm install
```

Compile contracts:

```bash
npx hardhat compile
```

---

## Run Automated Tests

The project includes a test suite that covers:

Room creation & initial state
Player joins & pool updates
Start-room permissions & player count checks
Full 3-player game flow (join → start → vote → finalize → payout)

Run the tests:

```bash
npx hardhat test test/depoker.js
```

You should see:

```text
  DePoker
    ✓ creates a room with correct buy-in and initial state
    ✓ lets players join with exact buy-in and updates pool
    ✓ only creator can start and room must have at least 2 players
    ✓ runs a full 3-player game and pays majority winner

  4 passing (XXXms)
```

---

## Running a Local Network

Start a local Hardhat node in Terminal 1:

```bash
cd DePoker
npx hardhat node
```

You will see 20 test accounts, each with 10,000 ETH (testnet ETH, not real).

Keep this terminal open.

---

## Deployment Script

In Terminal 2, you can deploy the contract to the local node:

```bash
cd DePoker
npx hardhat run --network localhost scripts/deploy_depoker.js
```

You will see output like:

```text
Deploying DePoker with account: 0xf39F...
DePoker deployed at: 0x5FbD...
```

This gives you a real contract address on the local dev chain.

---

## Demo Script: One Full Game Round

The script scripts/demo_round.js runs a full end-to-end scenario:

Deploys DePoker
Creates a room with configurable buy-in
Lets N players join
Starts the room
Simulates a vote with a strict majority winner
Finalizes the room and prints the winner’s balance change

Basic usage (default: 5 players, 1 ETH buy-in)

```bash
cd DePoker
npx hardhat run --network localhost scripts/demo_round_v4.js
```

Customize number of players

Use environment variable NUM_PLAYERS (minimum 2, maximum 19):

```bash
NUM_PLAYERS=7 npx hardhat run --network localhost scripts/demo_round_v4.js
```

Customize buy-in amount

Use BUY_IN_ETH (string passed to ethers.parseEther):

```bash
NUM_PLAYERS=6 BUY_IN_ETH=0.5 npx hardhat run --network localhost scripts/demo_round_v4.js
```

Example output (6 players, 0.5 ETH):

```text
=== DePoker Demo Round ===
Owner: 0xf39F...
Players (6): [ ... ]
DePoker deployed at: 0xA51c...
Room 0 created ... with buy-in 0.5 ETH
- Player joined: ...
...
After join: playerCount=6, totalPool=3.0 ETH
Room started=false, settled=false
Room started by owner.
Room started flag now: true
Simulated majority winner: 0x7099...
Voting plan: winner will receive 4 votes out of 6 players
Vote: voter ... -> ...
...
Winner balance before: 10008.9998... ETH
Room finalized.
=== Final Room State ===
creator:      0xf39F...
buyIn:        0.5 ETH
playerCount:  6n
totalPool:    0.0 ETH
started:      true
settled:      true
winner:       0x7099...
Winner balance after:  10011.9998... ETH
Winner net change (approx, minus gas): 3.0 ETH
=== Demo round finished ===
```

It shows that

Total pool = NUM_PLAYERS × BUY_IN_ETH
Pool goes to the strictly majority-voted winner
State is transparently recorded on-chain

---

## How This Maps to Real Poker Nights

In a real-life student poker group:

Before the game:

Everyone buys chips by sending stablecoins/ETH → joinRoom()

During the game:

Game itself stays off-chain (physical cards / online room)

After the game:

All players vote for the true winner → voteWinner()

Contract checks majority and automatically settles → finalize()

This demo currently focuses on the settlement & voting layer.
Future extensions (out of current MVP scope but planned):

Reputation system (players gain/lose reputation based on honest voting)

Anti-collusion mechanics

On-chain rewards (NFT badges for high-reputation players)

Frontend (React + ethers.js) to replace manual scripts

---

## Development Notes

This repo uses Hardhat + JavaScript (not TypeScript) for simplicity.

All examples assume running on localhost Hardhat network.

Gas fee parameters can be customized in scripts (e.g. via getFeeData),
but on local node the exact values don’t matter economically.

---

## Disclaimer

DePoker is a research / educational prototype for a course on
Web3 / blockchain app design.

Not audited

Not for production

Not for real-money gambling on mainnet

Use only on local or test networks, with test ETH.

---


