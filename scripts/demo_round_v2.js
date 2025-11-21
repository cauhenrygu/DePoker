// scripts/demo_round_v2.js
// DePoker v2 demo: more realistic round with action history

const { ethers } = require("hardhat");

// Keep in sync with the enum in DePoker.sol
const ActionType = {
  Invalid: 0,
  Check: 1,
  Call: 2,
  Bet: 3,
  Raise: 4,
  Fold: 5,
  AllIn: 6,
};

const ActionTypeName = {
  0: "Invalid",
  1: "Check",
  2: "Call",
  3: "Bet",
  4: "Raise",
  5: "Fold",
  6: "AllIn",
};

async function main() {
  console.log("=== DePoker v2 Demo Round ===");

  const [owner, p1, p2, p3, p4] = await ethers.getSigners();
  console.log("Owner:", owner.address);
  console.log("Players:", [p1.address, p2.address, p3.address, p4.address]);
  console.log("");

  // Room config (you can change these values if you want)
  const BUY_IN_ETH = "1.0";
  const SMALL_BLIND_ETH = "0.1";
  const BIG_BLIND_ETH = "0.2";
  const MAX_PLAYERS = 6;

  const buyIn = ethers.parseEther(BUY_IN_ETH);
  const smallBlind = ethers.parseEther(SMALL_BLIND_ETH);
  const bigBlind = ethers.parseEther(BIG_BLIND_ETH);

  // 1. Deploy contract
  const depoker = await ethers.deployContract("DePoker");
  await depoker.waitForDeployment();
  const depokerAddr = await depoker.getAddress();
  console.log("DePoker deployed at:", depokerAddr);

  // 2. Create room
  const createTx = await depoker
    .connect(owner)
    .createRoom(buyIn, smallBlind, bigBlind, MAX_PLAYERS);
  const createRcpt = await createTx.wait();
  const roomId = 0n; // first room id is 0

  console.log(
    `Room ${roomId} created by ${owner.address} with buy-in ${BUY_IN_ETH} ETH`,
  );
  console.log("");

  // 3. Players join with exact buy-in
  const players = [p1, p2, p3, p4];

  for (const signer of players) {
    const tx = await depoker
      .connect(signer)
      .joinRoom(roomId, { value: buyIn });
    await tx.wait();
    console.log("- Player joined:", signer.address);
  }

  let room = await depoker.getRoom(roomId);
  let [, , playerCount, totalPool, started, settled] = room;

  console.log(
    `After join: playerCount=${playerCount}, totalPool=${ethers.formatEther(
      totalPool,
    )} ETH`,
  );
  console.log(`Room started=${started}, settled=${settled}`);
  console.log("");

  // 4. Start the room (only creator)
  let tx = await depoker.connect(owner).startRoom(roomId);
  await tx.wait();
  room = await depoker.getRoom(roomId);
  [, , , , started] = room;

  console.log("Room started by owner.");
  console.log("Room started flag now:", started);
  console.log("");

  // --- 5. Simulate a more realistic action sequence ---

  console.log("=== Pre-flop actions ===");
  const sbPlayer = p1;
  const bbPlayer = p2;
  const caller = p3;
  const earlyFolder = p4;

  // Helper to record an action and log it
  async function recordAction(
    signer,
    actionType,
    amountWei,
    humanLabel,
  ) {
    const tx = await depoker
      .connect(signer)
      .recordAction(roomId, actionType, amountWei);
    await tx.wait();
    console.log(
      `[Action] ${signer.address} -> ${humanLabel} (type=${ActionTypeName[actionType]}, amount=${ethers.formatEther(
        amountWei,
      )} ETH)`,
    );
  }

  // Small blind
  await recordAction(
    sbPlayer,
    ActionType.Bet,
    smallBlind,
    `small blind ${SMALL_BLIND_ETH} ETH`,
  );

  // Big blind
  await recordAction(
    bbPlayer,
    ActionType.Bet,
    bigBlind,
    `big blind ${BIG_BLIND_ETH} ETH`,
  );

  // Player 3 calls the big blind
  await recordAction(
    caller,
    ActionType.Call,
    bigBlind,
    `call big blind ${BIG_BLIND_ETH} ETH`,
  );

  // Player 4 folds pre-flop
  await recordAction(earlyFolder, ActionType.Fold, 0n, "fold pre-flop");

  console.log("");

  // Show action history from the contract
  console.log("=== On-chain action history ===");
  const actions = await depoker.getActions(roomId);

  actions.forEach((a, idx) => {
    const typeNum = Number(a.actionType);
    const typeName = ActionTypeName[typeNum] ?? `Unknown(${typeNum})`;
    console.log(
      `#${idx} player=${a.player} type=${typeName} amount=${ethers.formatEther(
        a.amount,
      )} ETH timestamp=${a.timestamp}`,
    );
  });

  console.log("");

  // --- 6. Voting for the winner ---

  console.log("=== Voting phase ===");

  // Folded player (p4) is not allowed to vote; active players are p1, p2, p3
  const activePlayers = [p1, p2, p3];
  const winnerSigner = p2; // choose p2 as the winner for this demo
  const winnerAddr = winnerSigner.address;

  console.log("Winner candidate:", winnerAddr);

  // All active players vote for p2 (unanimous)
  for (const voter of activePlayers) {
    const tx = await depoker
      .connect(voter)
      .voteWinner(roomId, winnerAddr);
    await tx.wait();
    console.log(`Vote: ${voter.address} -> ${winnerAddr}`);
  }

  // --- 7. Finalize and inspect balances / reputation ---

  console.log("");
  console.log("=== Finalization ===");

  const winnerBalanceBefore = await ethers.provider.getBalance(
    winnerAddr,
  );
  console.log(
    "Winner balance before:",
    ethers.formatEther(winnerBalanceBefore),
    "ETH",
  );

  const finalizeTx = await depoker
    .connect(owner)
    .finalize(roomId, winnerAddr);
  await finalizeTx.wait();
  console.log("Room finalized by creator.");

  room = await depoker.getRoom(roomId);
  [, , playerCount, totalPool, started, settled, ,] = room;

  console.log("Final room state:");
  console.log(" - playerCount:", playerCount.toString());
  console.log(" - totalPool:", ethers.formatEther(totalPool), "ETH");
  console.log(" - started:", started);
  console.log(" - settled:", settled);
  console.log(" - winner:", room[6]); // winner address

  const winnerBalanceAfter = await ethers.provider.getBalance(winnerAddr);
  console.log(
    "Winner balance after:",
    ethers.formatEther(winnerBalanceAfter),
    "ETH",
  );
  const delta = winnerBalanceAfter - winnerBalanceBefore;
  console.log(
    "Winner net change (approx, minus gas):",
    ethers.formatEther(delta),
    "ETH",
  );

  console.log("");
  console.log("=== Reputation scores ===");
  for (const signer of players) {
    const rep = await depoker.reputation(signer.address);
    console.log(`Reputation[${signer.address}] = ${rep.toString()}`);
  }

  console.log("=== Demo round finished ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
