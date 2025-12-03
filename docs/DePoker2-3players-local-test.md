# DePoker2 本地 3 玩家 3 终端测试说明

本说明文档演示如何在本地 Hardhat 网络上，用 **3 个不同终端** 分别扮演：

- 终端 A：Hardhat 节点（本地链）
- 终端 B：房主 / 玩家 P0（owner）
- 终端 C：玩家 P1
- 终端 D：玩家 P2

并完成一次完整的流程：

1. 房主创建房间并自己加入  
2. P1 / P2 分别加入同一房间  
3. 房主开始牌局  
4. 三人都投票给房主  
5. 房主结算房间，查看最终 winner 和三人的 reputation

> **约定：**
> - 买入 `buyIn = 1 ETH`（仅本地测试，实际是 1 ether 的单位）
> - 使用 Hardhat 默认账户：
>   - `owner = signers[0]`
>   - `p1    = signers[1]`
>   - `p2    = signers[2]`

---

## 1. 准备工作 & 终端布局

### 1.1 终端 A：启动 Hardhat 本地链

```bash
cd ~/depoker2_ws
npx hardhat node
```

保持这个终端开着，**不要关闭**。  
本地链与所有后续操作都依赖这个进程。

---

### 1.2 终端 B：部署合约 + 扮演房主（owner / P0）

新开一个终端（终端 B）：

```bash
cd ~/depoker2_ws
npx hardhat run --network localhost scripts/deploy_depoker2.js
```

你会看到类似输出：

```text
DePoker2 deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Saved deployment info to /home/huangu/depoker2_ws/deployments/localhost-DePoker2.json
```

记下这里的合约地址（例子里是 `0x5FbD...aa3`，后面会用到）。

然后在同一个终端 B 里打开 Hardhat console：

```bash
npx hardhat console --network localhost
```

#### 终端 B / owner：初始化合约与玩家

在 Hardhat console（`>` 提示符）中执行：

```js
// 1. 拿到三个 signer：owner, p1, p2
const [owner, p1, p2] = await ethers.getSigners();

// 2. 获取合约工厂
const DePoker2 = await ethers.getContractFactory("DePoker2");

// 3. 连接到刚刚部署的合约地址（替换成你实际的部署地址）
const depoker2 = await DePoker2.attach("0x5FbDB2315678afecb367f032d93F642f64180aa3");

// 4. 设置买入金额：1 ETH
const buyIn = ethers.parseEther("1");
```

---

## 2. 房主创建房间并加入

仍在 **终端 B / owner console** 中执行：

```js
// 1) 创建房间
const txCreate = await depoker2.connect(owner).createRoom(buyIn);
const receipt  = await txCreate.wait();
const ev       = receipt.logs.find(l => l.eventName === "RoomCreated");
const roomId   = ev.args.roomId;

// 确认房间 ID（一般为 "0"）
roomId.toString();
```

输出应类似：

```text
'0'
```

然后房主自己先加入房间：

```js
await depoker2.connect(owner).joinRoom(roomId, { value: buyIn });

// 查看当前房间的玩家数量
(await depoker2.getRoom(roomId)).playerCount.toString();
// 现在应该是 '1'
```

到这里，**房主已经在房间里等待其他玩家**。

---

## 3. 玩家 P1 加入（终端 C）

### 3.1 打开第三个终端（终端 C）

```bash
cd ~/depoker2_ws
npx hardhat console --network localhost
```

### 3.2 在终端 C / P1 console 中执行：

```js
// 1) 获取 signer
const signers = await ethers.getSigners();
const p1 = signers[1];  // 第二个账户

// 2) 连接同一个 DePoker2 合约地址
const DePoker2 = await ethers.getContractFactory("DePoker2");
const depoker2 = await DePoker2.attach("0x5FbDB2315678afecb367f032d93F642f64180aa3");

// 3) 设置买入金额和房间号
const buyIn = ethers.parseEther("1");
const roomId = 0n;

// 4) P1 加入房间
await depoker2.connect(p1).joinRoom(roomId, { value: buyIn });

// （可选）查看房间人数
(await depoker2.getRoom(roomId)).playerCount.toString();
// 现在应该是 '2'
```

---

## 4. 玩家 P2 加入（终端 D）

### 4.1 打开第四个终端（终端 D）

```bash
cd ~/depoker2_ws
npx hardhat console --network localhost
```

### 4.2 在终端 D / P2 console 中执行：

```js
// 1) 获取 signer
const signers = await ethers.getSigners();
const p2 = signers[2];  // 第三个账户

// 2) 连接同一个 DePoker2 合约地址
const DePoker2 = await ethers.getContractFactory("DePoker2");
const depoker2 = await DePoker2.attach("0x5FbDB2315678afecb367f032d93F642f64180aa3");

// 3) 设置买入金额和房间号
const buyIn = ethers.parseEther("1");
const roomId = 0n;

// 4) P2 加入房间
await depoker2.connect(p2).joinRoom(roomId, { value: buyIn });

// （可选）查看房间人数
(await depoker2.getRoom(roomId)).playerCount.toString();
// 现在应该是 '3'
```

---

## 5. 房主开始房间 & 三人投票

### 5.1 房主开始该房间（终端 B）

切回 **终端 B / owner console**：

```js
// 再确认一下当前房间的玩家数量
(await depoker2.getRoom(roomId)).playerCount.toString();  // 应为 '3'

// 开局：房主 startRoom
await depoker2.connect(owner).startRoom(roomId);
```

### 5.2 三人都投票给 owner

> 为简单起见，这个测试场景里 **三个人都投给 owner**，  
> 最后 winner 会是 owner，并且三个人 reputation 都会 +1。

#### 终端 B / owner 自己投票：

```js
await depoker2.connect(owner).voteWinner(roomId, owner.address);
```

#### 终端 C / P1 投票：

```js
// 先取出 owner 地址（与前面终端中保持一致）
const all = await ethers.getSigners();
const owner = all[0];

await depoker2.connect(p1).voteWinner(roomId, owner.address);
```

#### 终端 D / P2 投票：

```js
const all = await ethers.getSigners();
const owner = all[0];

await depoker2.connect(p2).voteWinner(roomId, owner.address);
```

---

## 6. 房主结算 & 查看结果

回到 **终端 B / owner console** 进行结算：

```js
// 结算本局：指定 winner 为 owner
await depoker2.connect(owner).finalize(roomId, owner.address);

// 查看房间的最终 winner
(await depoker2.getRoom(roomId)).winner;
```

你应该看到 winner 地址为 `owner.address`：

```text
'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
```

然后查看三人的 reputation：

```js
(await depoker2.getReputation(owner.address)).toString();
(await depoker2.getReputation(p1.address)).toString();
(await depoker2.getReputation(p2.address)).toString();
```

预期输出：

```text
'1'
'1'
'1'
```

说明：

- 本局中三人都做出了“正确投票”（都投给真实赢家 owner）
- 因此三人的 reputation 都从 0 增加到了 1

---

## 7. 小结 & 变体建议

通过这个 **3 玩家 3 终端** 的本地测试，你可以验证：

- 同一个合约地址可以被多个终端 / 多个 signer 同时连接使用  
- `createRoom → joinRoom → startRoom → voteWinner → finalize` 的整套流程  
- `getRoom(roomId)` 中的 `playerCount` / `winner` 随着流程变化  
- `getReputation(address)` 随着不同投票结果逐步积累

你可以尝试的变体包括：

- 改成只有 2 个人投给 owner，另 1 个人投给别人  
- 多开几次 room（`roomId = 0, 1, 2, ...`），观察 reputation 如何跨房间累积  
- 将本流程抽象成前端交互：  
  - 由房主在 UI 上创建房间 & 开局  
  - 多个浏览器页面分别连接不同钱包地址进行 join & vote

> 这个文档可以直接保存为  
> `docs/DePoker2-3players-local-test.md`，  
> 或者作为 README 中“本地三人测试”一节。

