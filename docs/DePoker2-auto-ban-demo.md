# DePoker2 Reputation & Auto-Ban Demo (v3)

This document explains how to run and interpret the **DePoker2 reputation & auto-ban demo** using:

- Contract: `contracts/DePoker2.sol`
- Script: `scripts/demo_depoker2_round_v3.js`
- Network: local Hardhat node (`localhost`)

In this demo:

- Players join a room and buy in with ETH  
- A random winner is chosen on-chain  
- Most players vote honestly for the true winner  
- A few “selfish” players vote for themselves  
- The contract:
  - Rewards **correct votes** with positive reputation
  - Penalizes **wrong votes** with negative reputation
  - **Bans** addresses whose reputation falls below a threshold, preventing them from joining future rooms

---

## 1. Prerequisites

You should already have:

- Node.js and npm installed
- Hardhat and project dependencies installed:

```bash
npm install
```

The repository layout (simplified):

```text
.
├── contracts/
│   └── DePoker2.sol
├── scripts/
│   ├── deploy_depoker2.js
│   ├── demo_depoker2_round_v1.js
│   ├── demo_depoker2_round_v2.js
│   └── demo_depoker2_round_v3.js   # this demo
├── test/
│   └── depoker2.js
├── deployments/
│   └── localhost-DePoker2.json     # address of DePoker2 on localhost
├── hardhat.config.js
└── README.md
```

Make sure `DePoker2.sol` has been compiled:

```bash
npx hardhat compile
```

---

## 2. Contract Deployment on Localhost

### 2.1 Start Hardhat Node

In **Terminal 1**, start a local node:

```bash
npx hardhat node
```

Keep this terminal open.  
You should see a list of test accounts with large ETH balances.

### 2.2 Deploy DePoker2

In **Terminal 2**, deploy the contract to the local node:

```bash
npx hardhat run --network localhost scripts/deploy_depoker2.js
```

Example output:

```text
DePoker2 deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Saved deployment info to deployments/localhost-DePoker2.json
```

The deployment script writes the contract address into:

```text
deployments/localhost-DePoker2.json
```

`demo_depoker2_round_v3.js` will read this file and attach to the deployed contract.

---

## 3. Reputation Logic (High-Level)

`DePoker2.sol` tracks a simple **reputation score** for each address:

- Addresses start near `0` (or at some neutral baseline).
- On every finalized room:
  - **Correct voters** (who voted for the actual winner) gain reputation points.
  - **Wrong voters** (who voted for someone else) lose reputation points.
  - The **winner** may also gain additional reputation (depending on your contract logic).

Additionally, the contract defines a **ban threshold**, for example:

```solidity
int256 public constant BAN_THRESHOLD = -3; // or -100, depending on your version
```

Anyone with `reputation[addr] <= BAN_THRESHOLD`:

- Cannot join new rooms.
- `joinRoom` will revert with `"reputation too low"`.

This is the **forced kick-out / auto-ban** behavior we highlight in the demo.

---

## 4. Demo Script Behavior (v3)

Script file:

```text
scripts/demo_depoker2_round_v3.js
```

Key parameters at the top of the script:

- `NUM_PARTICIPANTS = 10`
- `BUY_IN_ETH = process.env.BUY_IN_ETH || "1.0"`

You can optionally override the buy-in by setting:

```bash
export BUY_IN_ETH=0.5
```

before running the script. If not set, it defaults to `1.0` ETH.

---

## 5. Running the v3 Demo

Assuming your local node (Terminal 1) and deployment are ready:

In **Terminal 2**, from the project root:

```bash
npx hardhat run --network localhost scripts/demo_depoker2_round_v3.js
```

### 5.1 Example Output: Single Round

You will see logs like:

```text
Network: localhost, using 10 participants
Using DePoker2 at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Creating room with buy-in = 1.0 ETH ...
Room created, id = 8
Player 0 (0x7099...) joining room ...
Player 1 (0x3C44...) joining room ...
...
Player 9 (0xBcd4...) joining room ...
After joins: playerCount (joined) = 10 expected pot = 10.0 ETH

Random winner chosen: Player 1 (0x3C44...)
Starting room ...
Player 0 (0x7099...) voting CORRECT for winner 0x3C44...
Player 1 (0x3C44...) voting CORRECT for winner 0x3C44...
...
Player 7 (0x2361...) voting for THEMSELVES (0x2361...)
Player 8 (0xa0Ee...) voting for THEMSELVES (0xa0Ee...)
Player 9 (0xBcd4...) voting CORRECT for winner 0x3C44...

Finalizing room ...
Room finalized on-chain.
Reputation scores (all configured players):
  Player 0 (0x7099...): rep = 8
  Player 1 (0x3C44...): rep = 4
  Player 2 (0x90F7...): rep = 8
  ...
  Player 9 (0xBcd4...): rep = 1
```

Interpretation:

- All 10 players joined; pot = 10 × 1 ETH = 10 ETH.
- A random winner (here player 1) is chosen among those who joined.
- Most players voted correctly (for the actual winner).
- A few players voted for themselves (wrong votes).
- After `finalize`, reputations are updated:
  - Honest voters moved **up**.
  - Selfish / wrong voters moved **down**.
  - Repeated wrong votes will eventually push them below the ban threshold.

---

## 6. Auto-Ban in Action

If you run the v3 demo repeatedly, reputation will evolve. Eventually, some addresses will fall below the ban threshold and be **auto-banned**.

### 6.1 Example: A Player Gets Banned

After a few rounds, running the script again might produce:

```text
Network: localhost, using 10 participants
Using DePoker2 at: 0x5FbD...
Creating room with buy-in = 1.0 ETH ...
Room created, id = 10
Player 0 (0x7099...) joining room ...
Player 1 (0x3C44...) joining room ...
...
Player 7 (0x2361...) joining room ...
Player 8 (0xa0Ee...) joining room ...
Player 8 (0xa0Ee...) FAILED to join – reputation too low (auto-banned).
Player 9 (0xBcd4...) joining room ...
After joins: playerCount (joined) = 9 expected pot = 9.0 ETH
```

Explanation:

- Address `0xa0Ee...` has reputation **below the ban threshold**.
- When `joinRoom` is called, the contract reverts with `"reputation too low"`.
- The script catches this error and prints:

  > `FAILED to join – reputation too low (auto-banned).`

- This player no longer participates in the room.
- The game continues with the remaining players (here 9).

At the end of the round, you still see the updated reputation table, including the banned player:

```text
Reputation scores (all configured players):
  Player 0 (0x7099...): rep = 10
  Player 1 (0x3C44...): rep = 6
  Player 2 (0x90F7...): rep = 10
  ...
  Player 8 (0xa0Ee...): rep = -4
  Player 9 (0xBcd4...): rep = 1
```

Player 8 continues to have a negative score and will stay banned until/unless you reset state (e.g., redeploy the contract or reset the chain).

---

## 7. Script Structure (Conceptual)

Even without reading all JavaScript details, you can think of `demo_depoker2_round_v3.js` as doing:

1. **Attach to deployed contract**  
   Reads `deployments/localhost-DePoker2.json` and gets the DePoker2 address.

2. **Pick roles**
   - `signers[0]` → owner / room creator  
   - `signers[1..N]` → players

3. **Create room**
   - `createRoom(buyIn)` by owner
   - Room ID inferred as `nextRoomId - 1`

4. **Join room (with auto-ban)**
   - Each player calls `joinRoom(roomId, { value: buyIn })`
   - If revert has `"reputation too low"`, the player is considered **auto-banned** and is skipped.

5. **Random winner**
   - Choose one of the successfully-joined players uniformly at random.

6. **Voting phase**
   - Most players vote for the true winner.
   - A few “noisy” players vote for their own address (wrong vote).

7. **Finalize**
   - Owner calls `finalize(roomId, winnerAddr)`.
   - Contract:
     - Checks strict majority.
     - Transfers the entire pool to the winner.
     - Updates reputation for all voters.

8. **Print reputations**
   - Loops over all configured players and prints `reputation[addr]` from the contract.

---

## 8. Resetting State

If you want to restart everything from scratch:

1. Stop the Hardhat node (Terminal 1).
2. Restart `npx hardhat node`.
3. Redeploy DePoker2:

   ```bash
   npx hardhat run --network localhost scripts/deploy_depoker2.js
   ```

4. Run v3 demo again:

   ```bash
   npx hardhat run --network localhost scripts/demo_depoker2_round_v3.js
   ```

This will reset all on-chain state, including reputation and room history.

---

## 9. Summary

The DePoker2 v3 demo showcases:

- A **multi-round**, on-chain settlement system for friendly poker games.
- A **reputation mechanism** that rewards honest voting and punishes dishonest voting.
- A **ban threshold** that automatically excludes low-reputation addresses from future rooms.

From a user’s perspective:

- If you consistently vote correctly, your score grows and you keep playing.
- If you repeatedly try to cheat (vote for yourself regardless of reality), sooner or later:
  - Your reputation dives below the threshold.
  - The system **auto-bans** you: `joinRoom` reverts with `"reputation too low"`.

This mirrors a social system where **honest players are favored** and **persistent bad actors are excluded** from future games.
