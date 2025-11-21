const { ethers } = require("hardhat");

async function main() {
  console.log("=== DePoker v2 Demo Round v4 (6 players, 3 betting rounds) ===");

  const [
    owner,
    p1,
    p2,
    p3,
    p4,
    p5,
    p6,
  ] = await ethers.getSigners();

  console.log("Owner :", owner.address);
  console.log("Players:", [
    p1.address,
    p2.address,
    p3.address,
    p4.address,
    p5.address,
    p6.address,
  ]);
  console.log();

  // ---------- 1. Deploy contract ----------
  const DePoker = await ethers.getContractFactory("DePoker");
  const depoker = await DePoker.deploy();
  await depoker.waitForDeployment();
  const depokerAddress = await depoker.getAddress();
  console.log("DePoker deployed at:", depokerAddress);

  // ---------- 2. Create room ----------
  const buyIn = ethers.parseEther("1.0");
  const smallBlind = ethers.parseEther("0.1");
  const bigBlind = ethers.parseEther("0.2");
  const maxPlayers = 6;

  const txCreate = await depoker.createRoom(
    buyIn,
    smallBlind,
    bigBlind,
    maxPlayers
  );
  await txCreate.wait();

  const roomId = 0;

  console.log(
    `Room ${roomId} created by ${owner.address} with buy-in ${ethers.formatEther(
      buyIn
    )} ETH, small blind ${ethers.formatEther(
      smallBlind
    )} ETH, big blind ${ethers.formatEther(bigBlind)} ETH`
  );
  console.log();

  // ---------- 3. Players join ----------
  const players = [p1, p2, p3, p4, p5, p6];

  for (const signer of players) {
    const addr = await signer.getAddress();
    const tx = await depoker
      .connect(signer)
      .joinRoom(roomId, { value: buyIn });
    await tx.wait();
    console.log(`- Player joined: ${addr}`);
  }

  let room = await depoker.getRoom(roomId);
  let [, , playerCount, totalPool, started, settled] = room;

  console.log(
    `After join: playerCount=${playerCount}, totalPool=${ethers.formatEther(
      totalPool
    )} ETH`
  );
  console.log(`Room started=${started}, settled=${settled}`);
  console.log();

  // ---------- 4. Start room ----------
  const txStart = await depoker.connect(owner).startRoom(roomId);
  await txStart.wait();
  console.log("Room started by owner.");

  room = await depoker.getRoom(roomId);
  [, , , , started] = room;
  console.log("Room started flag now:", started);
  console.log();

  // ActionType enum mapping (must match Solidity)
  const ActionType = {
    Fold: 0,
    Check: 1,
    Call: 2,
    Bet: 3,
    Raise: 4,
  };

  async function recordAction(stage, signer, actionType, amountWei, note) {
    const addr = await signer.getAddress();
    const tx = await depoker
      .connect(signer)
      .recordAction(roomId, actionType, amountWei);
    await tx.wait();

    console.log(
      `[${stage}] ${addr} -> ${note} (type=${actionType}, amount=${ethers.formatEther(
        amountWei
      )} ETH)`
    );
  }

  // ---------- 5. Pre-flop actions ----------
  console.log("=== Pre-flop actions ===");

  // p1: small blind 0.1
  await recordAction(
    "Pre-flop",
    p1,
    ActionType.Bet,
    smallBlind,
    "small blind 0.1 ETH"
  );

  // p2: big blind 0.2
  await recordAction(
    "Pre-flop",
    p2,
    ActionType.Bet,
    bigBlind,
    "big blind 0.2 ETH"
  );

  // p3: call big blind 0.2
  await recordAction(
    "Pre-flop",
    p3,
    ActionType.Call,
    bigBlind,
    "call big blind 0.2 ETH"
  );

  // p4: raise to 0.4
  const raiseTo = ethers.parseEther("0.4");
  await recordAction(
    "Pre-flop",
    p4,
    ActionType.Raise,
    raiseTo,
    "raise to 0.4 ETH"
  );

  // p5: call 0.4
  await recordAction(
    "Pre-flop",
    p5,
    ActionType.Call,
    raiseTo,
    "call 0.4 ETH"
  );

  // p6: fold (on-chain fold, amount 0)
  await recordAction(
    "Pre-flop",
    p6,
    ActionType.Fold,
    0n,
    "folds pre-flop"
  );

  console.log();

  // ---------- 6. Flop actions ----------
  console.log("=== Flop actions ===");
  console.log("// Active players now: p1, p2, p3, p4, p5 (p6 already folded)");

  // p1: check
  await recordAction(
    "Flop",
    p1,
    ActionType.Check,
    0n,
    "check"
  );

  // p2: check
  await recordAction(
    "Flop",
    p2,
    ActionType.Check,
    0n,
    "check"
  );

  // p3: bet 0.3
  const flopBet = ethers.parseEther("0.3");
  await recordAction(
    "Flop",
    p3,
    ActionType.Bet,
    flopBet,
    "bet 0.3 ETH"
  );

  // p4: call 0.3
  await recordAction(
    "Flop",
    p4,
    ActionType.Call,
    flopBet,
    "call 0.3 ETH"
  );

  // p5: fold
  await recordAction(
    "Flop",
    p5,
    ActionType.Fold,
    0n,
    "folds on flop"
  );

  console.log();

  // ---------- 7. Turn actions ----------
  console.log("=== Turn actions ===");
  console.log("// Active players now: p1, p2, p3, p4 (p5 & p6 folded)");

  // p1: check
  await recordAction(
    "Turn",
    p1,
    ActionType.Check,
    0n,
    "check"
  );

  // p2: bet 0.5
  const turnBet = ethers.parseEther("0.5");
  await recordAction(
    "Turn",
    p2,
    ActionType.Bet,
    turnBet,
    "bet 0.5 ETH"
  );

  // p3: call 0.5
  await recordAction(
    "Turn",
    p3,
    ActionType.Call,
    turnBet,
    "call 0.5 ETH"
  );

  // p4: fold on turn
  await recordAction(
    "Turn",
    p4,
    ActionType.Fold,
    0n,
    "folds on turn"
  );

  console.log();

  // ---------- 8. Show on-chain actions ----------
  console.log("=== On-chain action log (room actions) ===");
  const actions = await depoker.getActions(roomId);

  actions.forEach((act, idx) => {
    const { player, actionType, amount, timestamp } = act;
    console.log(
      `#${idx} player=${player}, actionType=${actionType}, amount=${ethers.formatEther(
        amount
      )} ETH, ts=${timestamp}`
    );
  });
  console.log();

  // ---------- 9. Voting & finalize ----------
  console.log("=== Voting & finalization ===");

  // At this point:
  // - joined players: p1, p2, p3, p4, p5, p6
  // - folded: p6 (pre-flop), p5 (flop), p4 (turn)
  // -> active players for majority & voting: p1, p2, p3
  const activeVoters = [p1, p2, p3];
  const winnerSigner = p3;
  const winnerAddr = winnerSigner.address;

  console.log("Active voters:", activeVoters.map((s) => s.address));
  console.log("Winner candidate:", winnerAddr);

  let roomBefore = await depoker.getRoom(roomId);
  let [, , , totalPoolBefore] = roomBefore;
  console.log(
    "Total pool before finalize:",
    ethers.formatEther(totalPoolBefore),
    "ETH"
  );

  const winnerBalanceBefore = await ethers.provider.getBalance(winnerAddr);
  console.log(
    "Winner balance before:",
    ethers.formatEther(winnerBalanceBefore),
    "ETH"
  );

  // p1, p2, p3 all vote for p3 -> 3 votes, activePlayers = 3 -> strict majority
  for (const voter of activeVoters) {
    const vAddr = voter.address;
    const txVote = await depoker
      .connect(voter)
      .voteWinner(roomId, winnerAddr);
    await txVote.wait();
    console.log(`Vote: voter ${vAddr} -> ${winnerAddr}`);
  }

  // finalize by owner
  const txFinal = await depoker
    .connect(owner)
    .finalize(roomId, winnerAddr);
  await txFinal.wait();
  console.log("Room finalized.");

  const winnerBalanceAfter = await ethers.provider.getBalance(winnerAddr);
  console.log(
    "Winner balance after: ",
    ethers.formatEther(winnerBalanceAfter),
    "ETH"
  );
  console.log(
    "Winner net change (approx, minus gas):",
    ethers.formatEther(
      winnerBalanceAfter - winnerBalanceBefore
    ),
    "ETH"
  );

  const roomAfter = await depoker.getRoom(roomId);
  const [
    creatorAfter,
    buyInAfter,
    playerCountAfter,
    totalPoolAfter,
    startedAfter,
    settledAfter,
    winnerAfter,
  ] = roomAfter;

  console.log("=== Final Room State ===");
  console.log("creator:     ", creatorAfter);
  console.log("buyIn:       ", ethers.formatEther(buyInAfter), "ETH");
  console.log("playerCount: ", playerCountAfter);
  console.log("totalPool:   ", ethers.formatEther(totalPoolAfter), "ETH");
  console.log("started:     ", startedAfter);
  console.log("settled:     ", settledAfter);
  console.log("winner:      ", winnerAfter);

  // ---------- 10. Reputation summary ----------
  console.log();
  console.log("=== Reputation scores after this game ===");
  const rep = async (addr) =>
    await depoker.reputation(addr);

  console.log("owner rep:", (await rep(owner.address)).toString());
  console.log("p1 rep:   ", (await rep(p1.address)).toString());
  console.log("p2 rep:   ", (await rep(p2.address)).toString());
  console.log("p3 rep:   ", (await rep(p3.address)).toString());
  console.log("p4 rep:   ", (await rep(p4.address)).toString());
  console.log("p5 rep:   ", (await rep(p5.address)).toString());
  console.log("p6 rep:   ", (await rep(p6.address)).toString());

  console.log("=== Demo round v4 finished ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
