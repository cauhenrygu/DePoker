# DePoker 本地调试 Console 会话记录

## 环境信息

- 项目目录：`~/depoker2_ws`
- 本地链启动命令：`npx hardhat node`
- Console 命令：`npx hardhat console --network localhost`
- DePoker 合约地址：`0x5FbDB2315678afecb367f032d93F642f64180aa3`
- 使用账户（Hardhat 默认账号）：
  - owner  = Account #0 = `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
  - p1     = Account #1 = `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
  - p2     = Account #2 = `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
  - p3     = Account #3 = `0x90F79bf6EB2c4f870365E785982E1f101E93b906`

## 1. 连接合约 & 获取账户

```js
const depoker = await ethers.getContractAt(
  "DePoker",
  "0x5FbDB2315678afecb367f032d93F642f64180aa3"
);

const [owner, p1, p2, p3] = await ethers.getSigners();

owner.address
// '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
p1.address
// '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
p2.address
// '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
p3.address
// '0x90F79bf6EB2c4f870365E785982E1f101E93b906'


2. 创建房间（buy-in = 1 ETH）
const buyIn = ethers.parseEther("1.0");

const tx = await depoker.connect(owner).createRoom(buyIn);
await tx.wait();

const roomId = 0;

await depoker.getRoom(roomId);
// Result(8) [
//   '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // creator
//   1000000000000000000n,                        // buyIn = 1 ETH
//   0n,                                          // playerCount
//   0n,                                          // totalPool
//   false,                                       // started
//   false,                                       // settled
//   '0x0000000000000000000000000000000000000000',// winner
//   1763631487n                                  // createdAt
// ]


3. 三个玩家加入房间
await depoker.connect(p1).joinRoom(roomId, { value: buyIn });
await depoker.connect(p2).joinRoom(roomId, { value: buyIn });
await depoker.connect(p3).joinRoom(roomId, { value: buyIn });

await depoker.getRoom(roomId);
// playerCount: 3
// totalPool: 3000000000000000000n (3 ETH)

await depoker.getPlayers(roomId);
// Result(3) [
//   '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
//   '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
//   '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
// ]


4. 开始游戏（锁定房间）
await depoker.connect(owner).startRoom(roomId);

await depoker.getRoom(roomId);
// started: true
// settled: false


5. 投票选赢家（假设 p2 获胜）
await depoker.connect(p1).voteWinner(roomId, p2.address);
await depoker.connect(p2).voteWinner(roomId, p2.address);
await depoker.connect(p3).voteWinner(roomId, p3.address);
// 此时：p2 得到 2 票，p3 得到 1 票


6. 结算（finalize）
await depoker.connect(owner).finalize(roomId, p2.address);

await depoker.getRoom(roomId);
// Result(8) [
//   creator: owner,
//   buyIn: 1 ETH,
//   playerCount: 3,
//   totalPool: 0,
//   started: true,
//   settled: true,
//   winner: p2,
//   createdAt: 1763631487
// ]


7. 查看赢家余额变化（示例）
(await ethers.provider.getBalance(p2.address)).toString();
// '10001999904014739891768'

