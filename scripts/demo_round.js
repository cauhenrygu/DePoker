// scripts/demo_round.js
//
// 自动演示一局 DePoker：部署合约 -> 创建房间 -> N 个玩家加入 ->
// 开局 -> 投票 -> 结算 -> 打印赢家余额变化。

async function main() {
  const signers = await ethers.getSigners();
  const owner = signers[0];

  // 从环境变量里读玩家人数（不包括 owner），默认 5 人
  const numPlayersEnv = process.env.NUM_PLAYERS || "5";
  const numPlayers = parseInt(numPlayersEnv, 10);

  if (Number.isNaN(numPlayers) || numPlayers < 2) {
    throw new Error(`NUM_PLAYERS must be >= 2, got: ${numPlayersEnv}`);
  }

  if (numPlayers > signers.length - 1) {
    throw new Error(
      `Requested ${numPlayers} players, but only ${
        signers.length - 1
      } are available (exclude owner).`,
    );
  }

  const players = signers.slice(1, 1 + numPlayers);

  console.log("=== DePoker Demo Round ===");
  console.log("Owner:", owner.address);
  console.log(
    `Players (${numPlayers}):`,
    players.map((p) => p.address),
  );

  // 部署 DePoker 合约
  const DePoker = await ethers.getContractFactory("DePoker");
  const depoker = await DePoker.deploy();
  await depoker.waitForDeployment();
  const depokerAddress = await depoker.getAddress();

  console.log("DePoker deployed at:", depokerAddress);

  // 读 buy-in 配置，默认 1 ETH
  const buyInEth = process.env.BUY_IN_ETH || "1.0";
  const buyIn = ethers.parseEther(buyInEth);

  // 创建房间（roomId = 0）
  let tx = await depoker.connect(owner).createRoom(buyIn);
  await tx.wait();
  const roomId = 0;

  console.log(
    `Room ${roomId} created by ${owner.address} with buy-in ${buyInEth} ETH`,
  );

  // 玩家依次 joinRoom
  for (const player of players) {
    tx = await depoker.connect(player).joinRoom(roomId, { value: buyIn });
    await tx.wait();
    console.log(`- Player joined: ${player.address}`);
  }

  // 查看房间状态
  let room = await depoker.getRoom(roomId);
  const [, , playerCount, totalPool, startedBefore, settledBefore] = room;

  console.log(
    `After join: playerCount=${playerCount}, totalPool=${ethers.formatEther(totalPool)} ETH`,
  );
  console.log(
    `Room started=${startedBefore}, settled=${settledBefore}`,
  );

  // 开局
  tx = await depoker.connect(owner).startRoom(roomId);
  await tx.wait();
  console.log("Room started by owner.");

  // 重新读一眼
  room = await depoker.getRoom(roomId);
  const [, , , , startedAfter] = room;
  console.log("Room started flag now:", startedAfter);

  // 选一个“赢家候选人”（这里简单选 players[0]）
  const winnerIndex = 0;
  const winnerSigner = players[winnerIndex];
  const winnerAddr = winnerSigner.address;

  console.log("Simulated majority winner:", winnerAddr);


  // 投票策略：
  // 我们希望 winner 拿到严格多数票：votes > N / 2
  const n = players.length;
  const majorityCount = Math.floor(n / 2) + 1;

  console.log(
    `Voting plan: winner will receive ${majorityCount} votes out of ${n} players`,
  );

  // 前 majorityCount 个玩家投给 winner，剩下的投给自己
  for (let i = 0; i < players.length; i++) {
    const voter = players[i];
    const voteFor =
      i < majorityCount ? winnerAddr : players[i].address;

    tx = await depoker.connect(voter).voteWinner(roomId, voteFor);
    await tx.wait();
    console.log(
      `Vote: voter ${voter.address} -> ${voteFor}`,
    );
  }


  // 结算前赢家余额
  const winnerBalanceBefore =
    await ethers.provider.getBalance(winnerAddr);

  console.log(
    "Winner balance before:",
    ethers.formatEther(winnerBalanceBefore),
    "ETH",
  );

  // 结算：owner 调用 finalize，传入 majority winner
  tx = await depoker.connect(owner).finalize(roomId, winnerAddr);
  await tx.wait();
  console.log("Room finalized.");

  // 查看最终房间状态
  room = await depoker.getRoom(roomId);
  const [
    creatorFinal,
    buyInFinal,
    playerCountFinal,
    totalPoolFinal,
    startedFinal,
    settledFinal,
    winnerFinal,
  ] = room;

  console.log("=== Final Room State ===");
  console.log("creator:     ", creatorFinal);
  console.log("buyIn:       ", ethers.formatEther(buyInFinal), "ETH");
  console.log("playerCount: ", playerCountFinal);
  console.log(
    "totalPool:   ",
    ethers.formatEther(totalPoolFinal),
    "ETH",
  );
  console.log("started:     ", startedFinal);
  console.log("settled:     ", settledFinal);
  console.log("winner:      ", winnerFinal);

  // 结算后赢家余额
  const winnerBalanceAfter =
    await ethers.provider.getBalance(winnerAddr);
  console.log(
    "Winner balance after: ",
    ethers.formatEther(winnerBalanceAfter),
    "ETH",
  );

  const diff =
    winnerBalanceAfter - winnerBalanceBefore;
  console.log(
    "Winner net change (approx, minus gas):",
    ethers.formatEther(diff),
    "ETH",
  );

  console.log("=== Demo round finished ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
