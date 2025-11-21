// scripts/demo_round_v3.js
// DePoker v2 demo: 6-player game with two betting rounds and full action history

const { ethers } = require("hardhat");



// Keep in sync with the enum in DePoker.sol
// enum ActionType { Invalid, Call, Bet, Raise, Check, Fold, AllIn }
const ActionType = {
  Invalid: 0,
  Call: 1,
  Bet: 2,
  Raise: 3,
  Check: 4,
  Fold: 5,
  AllIn: 6,
};

const ActionTypeName = {
  0: "Invalid",
  1: "Call",
  2: "Bet",
  3: "Raise",
  4: "Check",
  5: "Fold",
  6: "AllIn",
};



function formatEth(value) {
  return `${ethers.formatEther(value)} ETH`;
}

async function main() {
  console.log("=== DePoker v2 Demo Round (6 players, 2 betting rounds) ===");

  const [owner, p1, p2, p3, p4, p5, p6] = await ethers.getSigners();
  const players = [p1, p2, p3, p4, p5, p6];

  console.log("Owner :", owner.address);
  console.log(
    "Players:",
    players.map((p) => p.address),
  );
  console.log("");

  // ---- Room config ----
  const BUY_IN_ETH = "1.0";
  const SMALL_BLIND_ETH = "0.1";
  const BIG_BLIND_ETH = "0.2";
  const MAX_PLAYERS = 9;

  const buyIn = ethers.parseEther(BUY_IN_ETH);
  const smallBlind = ethers.parseEther(SMALL_BLIND_ETH);
  const bigBlind = ethers.parseEther(BIG_BLIND_ETH);

  // ---- Deploy DePoker ----
  const depoker = await ethers.deployContract("DePoker");
  await depoker.waitForDeployment();
  const depokerAddr = await depoker.getAddress();
  console.log("DePoker deployed at:", depokerAddr);

  // ---- Create room ----
  const createTx = await depoker
    .connect(owner)
    .createRoom(buyIn, smallBlind, bigBlind, MAX_PLAYERS);
  await createTx.wait();

  const roomId = 0n; // first room id
  console.log(
    `Room ${roomId} created by ${owner.address} ` +
      `with buy-in ${BUY_IN_ETH} ETH, small blind ${SMALL_BLIND_ETH} ETH, big blind ${BIG_BLIND_ETH} ETH`,
  );
  console.log("");

  // ---- Players join ----
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
    `After join: playerCount=${playerCount}, totalPool=${formatEth(
      totalPool,
    )}`,
  );
  console.log(`Room started=${started}, settled=${settled}`);
  console.log("");

  // ---- Start room ----
  let tx = await depoker.connect(owner).startRoom(roomId);
  await tx.wait();
  room = await depoker.getRoom(roomId);
  [, , , , started] = room;

  console.log("Room started by owner.");
  console.log("Room started flag now:", started);
  console.log("");

  // Helper to record an action and log it
  async function recordAction(signer, actionType, amountWei, label) {
    const tx = await depoker
      .connect(signer)
      .recordAction(roomId, actionType, amountWei);
    await tx.wait();
    console.log(
      `[Action] ${signer.address} -> ${label} ` +
        `(type=${ActionTypeName[actionType]}, amount=${formatEth(amountWei)})`,
    );
  }

  // ============================================================
  // Pre-flop round
  // ============================================================
  console.log("=== Pre-flop actions ===");

  const sbPlayer = p1;
  const bbPlayer = p2;

  // p1 posts small blind
  await recordAction(
    sbPlayer,
    ActionType.Bet,
    smallBlind,
    `small blind ${SMALL_BLIND_ETH} ETH`,
  );

  // p2 posts big blind
  await recordAction(
    bbPlayer,
    ActionType.Bet,
    bigBlind,
    `big blind ${BIG_BLIND_ETH} ETH`,
  );

  // p3 calls big blind
  await recordAction(
    p3,
    ActionType.Call,
    bigBlind,
    `call big blind ${BIG_BLIND_ETH} ETH`,
  );

  // p4 raises to 0.4
  const raiseTo = ethers.parseEther("0.4");
  await recordAction(
    p4,
    ActionType.Raise,
    raiseTo,
    "raise to 0.4 ETH",
  );

  // p5 calls 0.4
  await recordAction(
    p5,
    ActionType.Call,
    raiseTo,
    "call 0.4 ETH",
  );

  // p6 folds pre-flop
  // await recordAction(p6, ActionType.Fold, 0n, "fold pre-flop");
  
  // p6 sits out this hand (offline fold, not recorded on-chain)
  console.log(
    `[Info] ${p6.address} folds pre-flop OFF-CHAIN (not recorded on-chain in this demo).`,
  );
  
  console.log("");

  // ============================================================
  // Flop round (second betting round)
  // ============================================================
  console.log("=== Flop actions ===");
  console.log("// Active players now: p1, p2, p3, p4, p5 (p6 already folded)");

  // p1 checks
  await recordAction(p1, ActionType.Check, 0n, "check");

  // p2 checks
  await recordAction(p2, ActionType.Check, 0n, "check");

  // p3 bets 0.5
  const flopBet = ethers.parseEther("0.5");
  await recordAction(p3, ActionType.Bet, flopBet, "bet 0.5 ETH");

  // p4 calls 0.5
  await recordAction(p4, ActionType.Call, flopBet, "call 0.5 ETH");

  // p5 folds on flop
  await recordAction(p5, ActionType.Fold, 0n, "fold on flop");

  console.log("");

  // Show full on-chain action history
  console.log("=== On-chain action history ===");
  const actions = await depoker.getActions(roomId);
  actions.forEach((a, idx) => {
    const typeNum = Number(a.actionType);
    const typeName = ActionTypeName[typeNum] ?? `Unknown(${typeNum})`;
    console.log(
      `#${idx} player=${a.player} type=${typeName} ` +
        `amount=${formatEth(a.amount)} timestamp=${a.timestamp}`,
    );
  });
  console.log("");

  // ============================================================
  // Voting phase
  // ============================================================
  console.log("=== Voting phase ===");
  console.log(
    "// Contract currently does NOT allow folded players to vote.",
  );
  console.log(
    "// Active voters: p1, p2, p3, p4  (p5 & p6 have folded and cannot vote).",
  );

  const winnerSigner = p4; // Choose p4 as winner in this demo
  const winnerAddr = winnerSigner.address;
  console.log("Winner candidate:", winnerAddr);

  const activeVoters = [p1, p2, p3, p4];

  for (const voter of activeVoters) {
    const tx = await depoker
      .connect(voter)
      .voteWinner(roomId, winnerAddr);
    await tx.wait();
    console.log(`Vote: ${voter.address} -> ${winnerAddr}`);
  }

  console.log("");

  // ============================================================
  // Finalization
  // ============================================================
  console.log("=== Finalization ===");

  const winnerBalanceBefore = await ethers.provider.getBalance(
    winnerAddr,
  );
  console.log(
    "Winner balance before:",
    formatEth(winnerBalanceBefore),
  );

  const finalizeTx = await depoker
    .connect(owner)
    .finalize(roomId, winnerAddr);
  await finalizeTx.wait();
  console.log("Room finalized by creator.");

  room = await depoker.getRoom(roomId);
  [, , playerCount, totalPool, started, settled] = room;

  console.log("Final room state:");
  console.log(" - playerCount:", playerCount.toString());
  console.log(" - totalPool:", formatEth(totalPool));
  console.log(" - started:", started);
  console.log(" - settled:", settled);
  console.log(" - winner:", room[6]); // winner address
  console.log("");

  const winnerBalanceAfter = await ethers.provider.getBalance(
    winnerAddr,
  );
  const delta = winnerBalanceAfter - winnerBalanceBefore;

  console.log(
    "Winner balance after:",
    formatEth(winnerBalanceAfter),
  );
  console.log(
    "Winner net change (approx, minus gas):",
    formatEth(delta),
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
