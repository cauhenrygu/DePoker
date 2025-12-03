const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadDePoker2Address() {
  const networkName = hre.network.name;
  const filePath = path.join(
    __dirname,
    "..",
    "deployments",
    `${networkName}-DePoker2.json`
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`Deployment file not found: ${filePath}.
Please run: npx hardhat run --network ${networkName} scripts/deploy_depoker2.js`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);
  if (!json.address) {
    throw new Error(`No "address" field in ${filePath}`);
  }
  return json.address;
}

async function main() {
  const [owner, ...rest] = await hre.ethers.getSigners();

  // 最多 9 个额外玩家，加上房主总共 10 人
  const extraPlayers = rest.slice(0, 9);
  const participants = [owner, ...extraPlayers];

  console.log(
    `Network: ${hre.network.name}, using ${participants.length} participants`
  );

  const address = loadDePoker2Address();
  console.log("Using DePoker2 at:", address);

  const DePoker2 = await hre.ethers.getContractFactory("DePoker2");
  const depoker2 = await DePoker2.attach(address);

  const buyIn = hre.ethers.parseEther("1");
  console.log("Creating room with buy-in = 1 ETH ...");

  // 创建房间，并从 RoomCreated 事件中读取 roomId
  const txCreate = await depoker2.connect(owner).createRoom(buyIn);
  const receiptCreate = await txCreate.wait();
  const ev = receiptCreate.logs.find((log) => log.eventName === "RoomCreated");
  if (!ev) {
    throw new Error("RoomCreated event not found");
  }
  const roomId = ev.args.roomId;
  console.log("Room created, id =", roomId.toString());

  // 所有参与者 join
  for (let i = 0; i < participants.length; i++) {
    const signer = participants[i];
    const addr = await signer.getAddress();
    console.log(`Player ${i} (${addr}) joining room ...`);
    const txJoin = await depoker2
      .connect(signer)
      .joinRoom(roomId, { value: buyIn });
    await txJoin.wait();
  }

  const roomAfterJoins = await depoker2.getRoom(roomId);

  // 兼容：按名字 / 按索引两种取值方式
  const playerCount = roomAfterJoins.playerCount ?? roomAfterJoins[2];
  const pot = roomAfterJoins.pot ?? roomAfterJoins[3];

  console.log(
    "After joins: playerCount =",
    playerCount.toString(),
    "pot =",
    hre.ethers.formatEther(pot),
    "ETH"
  );

  // 房主开局
  console.log("Starting room ...");
  const txStart = await depoker2.connect(owner).startRoom(roomId);
  await txStart.wait();

  // 所有人都投票给房主
  const winnerAddress = await owner.getAddress();
  for (let i = 0; i < participants.length; i++) {
    const signer = participants[i];
    const addr = await signer.getAddress();
    console.log(`Player ${i} (${addr}) voting for ${winnerAddress} ...`);
    const txVote = await depoker2
      .connect(signer)
      .voteWinner(roomId, winnerAddress);
    await txVote.wait();
  }

  // 房主结算
  console.log("Finalizing room ...");
  const txFinalize = await depoker2
    .connect(owner)
    .finalize(roomId, winnerAddress);
  await txFinalize.wait();

  const roomFinal = await depoker2.getRoom(roomId);
  const finalWinner = roomFinal.winner ?? roomFinal[6];
  const settled = roomFinal.settled ?? roomFinal[5];

  console.log("Room settled =", settled, "winner =", finalWinner);

  // 打印所有参与者的 reputation
  console.log("Reputation scores:");
  for (let i = 0; i < participants.length; i++) {
    const addr = await participants[i].getAddress();
    const rep = await depoker2.getReputation(addr);
    console.log(`  Player ${i} (${addr}): rep = ${rep.toString()}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
