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

// 洗牌工具函数
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
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

  // 随机选择一个赢家（在 0..participants.length-1 中随机）
  const winnerIndex = Math.floor(Math.random() * participants.length);
  const winnerSigner = participants[winnerIndex];
  const winnerAddress = await winnerSigner.getAddress();

  console.log(
    `Random winner chosen: Player ${winnerIndex} (${winnerAddress})`
  );

  // 房主开局
  console.log("Starting room ...");
  const txStart = await depoker2.connect(owner).startRoom(roomId);
  await txStart.wait();

  // 构造一个随机顺序的索引数组，用于决定谁投对、谁投自己
  const indices = shuffle(
    Array.from({ length: participants.length }, (_, i) => i)
  );

  // 设定：随机 8 个人投对，剩下的人投自己
  const correctCount = Math.min(8, participants.length);
  const correctVoters = new Set(indices.slice(0, correctCount));
  const wrongVoters = new Set(indices.slice(correctCount));

  // 每个玩家投票：
  // - 在 correctVoters 里的玩家投给 winnerAddress
  // - 在 wrongVoters 里的玩家投给自己的地址
  for (let i = 0; i < participants.length; i++) {
    const signer = participants[i];
    const addr = await signer.getAddress();
    let target;

    if (correctVoters.has(i)) {
      target = winnerAddress;
      console.log(
        `Player ${i} (${addr}) voting CORRECT for winner ${winnerAddress} ...`
      );
    } else {
      target = addr;
      console.log(
        `Player ${i} (${addr}) voting for THEMSELVES (${addr}) ...`
      );
    }

    const txVote = await depoker2.connect(signer).voteWinner(roomId, target);
    await txVote.wait();
  }

  // 房主结算（注意：传入刚才选出来的 winnerAddress）
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
