# DePoker v2 – Automated Test Report

## 1. Raw Hardhat Test Output

The following is the unmodified console output from running `npx hardhat test test/depoker.js`:

    huangu@huangu-2025:~/depoker2_ws$ npx hardhat test test/depoker.js
    
    
      DePoker v2
        ✔ creates a room with correct config and initial runtime state (60ms)
        ✔ lets players join with exact buy-in and updates pool; rejects incorrect or duplicate joins (52ms)
        ✔ only creator can start room and room must have at least 2 players (41ms)
        ✔ records actions correctly and prevents folded players or non-started rooms from acting (43ms)
        ✔ supports majority voting for winner, prevents finalize without majority, and updates reputation (52ms)
        ✔ only creator can finalize and candidate must be active player (joined & not folded) (40ms)
    
    
      6 passing (292ms)
    
    ·············································································································
    |  Solidity and Network Configuration                                                                   │
    ························|·················|···············|·················|································
    |  Solidity: 0.8.28     ·  Optim: false   ·  Runs: 200    ·  viaIR: false   ·  Block: 30,000,000 gas       │
    ························|·················|···············|·················|································
    |  Methods                                                                                              │
    ························|·················|···············|·················|················|···············
    |  Contracts / Methods  ·  Min            ·  Max          ·  Avg            ·  # calls       ·  usd (avg)   │
    ························|·················|···············|·················|················|···············
    |  DePoker              ·                                                                                 │
    ························|·················|···············|·················|················|···············
    |      createRoom       ·        172,011  ·      189,111  ·        186,668  ·            14  ·           -  │
    |      finalize         ·        140,345  ·      140,553  ·        140,484  ·             3  ·           -  │
    |      joinRoom         ·         93,089  ·      144,401  ·        111,991  ·            19  ·           -  │
    |      recordAction     ·        106,410  ·      123,907  ·        113,909  ·             7  ·           -  │
    |      startRoom        ·         50,318  ·       50,330  ·         50,320  ·             6  ·           -  │
    |      voteWinner       ·         62,084  ·       83,196  ·         73,368  ·             9  ·           -  │
    ························|·················|···············|·················|················|···············
    |  Deployments                            ·                                 ·  % of limit    ·              │
    |  DePoker              ·              -  ·            -  ·      3,193,080  ·        10.6 %  ·           -  │
    ·············································································································
    |  Key                                                                                                  │
    |  ◯  Execution gas for this method does not include intrinsic gas overhead                             │
    |  △  Cost was non-zero but below the precision setting for the currency display (see options)          │
    |  Toolchain:  hardhat                                                                                  │
    ·············································································································
    huangu@huangu-2025:~/depoker2_ws$ 


## 2. Test Environment

All tests were executed on the local Hardhat Network with the following configuration:

- Solidity compiler: 0.8.28 (no optimizer, viaIR: false)
- Hardhat EVM target: paris, block gas limit: 30,000,000
- Test framework: Mocha + Chai (via Hardhat)
- Ethers.js: v6 API (through @nomicfoundation/hardhat-ethers)
- Network: Hardhat local chain (chain ID 31337, funded dev accounts with 10,000 ETH each)

The Hardhat gas report also shows estimated gas usage for each public method and for contract deployment.

## 3. Test Suite Overview

The file test/depoker.js contains six test cases that together validate the core behavior of the DePoker v2 smart contract:

1. Room creation and configuration  
2. Joining a room and buy-in validation  
3. Starting a room (creator-only and minimum players)  
4. Recording actions (fold/check/bet/etc.) and fold rules  
5. Majority voting and reputation update  
6. Finalization permissions and candidate validity  

Below is a detailed description of each test.

---

### 3.1 creates a room with correct config and initial runtime state

**Goal**

Verify that createRoom correctly initializes both static configuration and runtime state for a new poker room.

**What it does**

- Deploys a fresh DePoker instance.
- Calls createRoom(buyIn, smallBlind, bigBlind, maxPlayers).
- Reads the merged room view via getRoom(roomId) and checks:
  - creator equals the caller (room creator).
  - buyIn equals the configured buy-in (1 ETH in the tests).
  - playerCount is 0.
  - totalPool is 0.
  - started is false, settled is false.
  - winner is the zero address.
  - createdAt is a non-zero timestamp.
- Separately checks roomConfigs(roomId) to confirm:
  - buyIn, smallBlind, bigBlind, and maxPlayers match the values used in createRoom.

**Result**

Room metadata and runtime state are consistent and correctly initialized after creation.

---

### 3.2 lets players join with exact buy-in and updates pool; rejects incorrect or duplicate joins

**Goal**

Validate the joinRoom logic, including correct ETH transfer, pool accounting, and error conditions.

**What it does**

- Creates a default room with a fixed buyIn.
- Two players (p1, p2) successfully join with msg.value == buyIn.
  - Expects PlayerJoined events to be emitted.
  - Confirms:
    - playerCount == 2
    - totalPool == 2 * buyIn
    - getPlayers(roomId) returns [p1, p2] in order.
- A third player (p3) tries to join with an incorrect buy-in amount (buyIn / 2):
  - Expects the transaction to revert with reason "incorrect buy-in amount".
- p1 tries to join again with the correct buyIn:
  - Expects the transaction to revert with reason "already joined".

**Result**

The contract enforces an exact buy-in amount, keeps a correct on-chain pool, and prevents duplicate joins.

---

### 3.3 only creator can start room and room must have at least 2 players

**Goal**

Ensure that only the room creator can start the game, and that a game cannot start with fewer than two players.

**What it does**

- Creates a default room.
- Only one player (p1) joins:
  - p1 tries to call startRoom(roomId) and is rejected with "only creator can start".
  - The creator tries to call startRoom(roomId) but is rejected with "not enough players".
- After a second player (p2) joins:
  - The creator successfully calls startRoom(roomId).
  - Expects a RoomStarted event with the correct roomId and creator.
  - getRoom(roomId) now reports:
    - started == true
    - settled == false

**Result**

The contract correctly restricts startRoom to the creator and enforces a minimum player count of 2.

---

### 3.4 records actions correctly and prevents folded players or non-started rooms from acting

**Goal**

Test the recordAction mechanism, including the requirement that the room must be started, and that folded players cannot act again.

**What it does**

1. Non-started room behavior
   - Creates a room and has p1 join.
   - Calls recordAction(roomId, ActionType.Check, 10) before the room is started.
   - Expects revert with "room not started".

2. Normal action logging after starting
   - p2 and p3 also join the room while it is still in the Open state.
   - The creator calls startRoom(roomId).
   - Once started:
     - p1 records a Check action with amount 10.
     - p2 records a Bet action with amount 50.
     - p3 records a Fold action (amount 0).
   - p3 then attempts another action (e.g., Call) and is rejected with "already folded".

3. Action history validation
   - Calls getActions(roomId) and checks:
     - There are exactly 3 actions.
     - actions[0] is a Check by p1 with amount 10.
     - actions[1] is a Bet by p2 with amount 50.
     - actions[2] is a Fold by p3 with amount 0.
   - Confirms hasFolded(roomId, p3) is true.

**Result**

The contract:

- Blocks actions in rooms that have not been started.
- Logs actions correctly (including type and declared chip amount).
- Prevents folded players from taking further actions.

---

### 3.5 supports majority voting for winner, prevents finalize without majority, and updates reputation

**Goal**

Verify the on-chain winner voting rules and the reputation update logic executed in finalize.

**What it does**

Two separate scenarios are tested.

#### Scenario A – No strict majority (4-player game)

- Creates a room with 4 players (p1, p2, p3, p4) joining.
- Starts the room.
- Voting:
  - p1, p2 vote for p2.
  - p3 votes for p3.
  - p4 votes for p4.
- Active players = 4, votes for p2 = 2.
  - Majority condition is votes * 2 > activePlayers.
  - Here 2 * 2 == 4 → no strict majority.
- Calling finalize(roomId, p2) reverts with "no majority for candidate".

#### Scenario B – Strict majority (3-player game)

- Creates a second room with 3 players (p1, p2, p3).
- All three join and the room is started.
- All three vote for p2 as the winner.
- The creator finalizes the room:
  - Expects a RoomFinalized event.
  - Confirms:
    - playerCount == 3
    - totalPool == 0 (full payout distributed)
    - started == true
    - settled == true
    - winner == p2
- Reputation:
  - Each joined player gets +1.
  - The winner gets an extra +2.
  - Final values:
    - reputation[p1] == 1
    - reputation[p2] == 3
    - reputation[p3] == 1

**Result**

The contract enforces a strict majority rule for winner selection, rejects finalization without a strict majority, and correctly updates reputation on successful finalization.

---

### 3.6 only creator can finalize and candidate must be active player (joined & not folded)

**Goal**

Ensure that only the room creator can finalize a room, and that the chosen winner candidate must be a valid active player (has joined and not folded).

**What it does**

- Creates a room with three players (p1, p2, p3).
- All three join, and the room is started.
- p3 performs a Fold action:
  - This marks p3 as folded and therefore inactive for both voting and winning.
- p3 then tries to vote:
  - Calling voteWinner(roomId, p1) reverts with "folded player cannot vote".
- Legitimate votes:
  - p1 and p2 both vote for p2 as the winner.
- Finalization checks:
  - p1 (non-creator) tries to finalize:
    - Reverts with "only creator can finalize".
  - The creator tries to finalize with p3 as candidate:
    - Reverts with "candidate folded".
  - The creator then finalizes with p2 as candidate:
    - Succeeds; room becomes settled, and winner == p2.

**Result**

The contract correctly enforces:

- Only the creator can call finalize.
- The winner candidate must be a joined, non-folded player.
- Folded players cannot vote or receive the final payout.

---

## 4. Summary

The current test/depoker.js suite provides automated coverage for the main lifecycle of a DePoker v2 room:

- Room creation and configuration  
- Joining with exact buy-in and pool accounting  
- Starting the game with proper permissions and minimum player count  
- Recording and inspecting player actions (fold/check/bet/etc.)  
- Winner voting with strict majority rules  
- Final payout and simple reputation updates  
- Permission checks for both startRoom and finalize  

All six tests pass on the local Hardhat Network (6 passing), and the gas usage table from Hardhat gives a rough estimate of the on-chain costs for each core method (createRoom, joinRoom, recordAction, voteWinner, finalize).  

This report can be included directly in your project documentation to show that the DePoker v2 contract is backed by a working automated test suite.

