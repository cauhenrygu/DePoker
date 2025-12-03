# DePoker2 随机赢家投票 & 声誉积累 Demo（本地 Hardhat）

本 demo 对应脚本：

- 部署脚本：`scripts/deploy_depoker2.js`
- 随机赢家 & 不完美投票 demo：`scripts/demo_depoker2_round_v2.js`

它展示了：

- 一局牌局中，所有玩家买入同样的筹码（本地 1 ETH）
- 房主 + 其他玩家一起参与投票
- 每局 **随机选出赢家地址**
- 每局有 **2 个玩家“只投自己”**，其余玩家投给真正赢家
- 正确投票的玩家 reputation +1，投错的不加分  
- 多次运行脚本后，可以看到每个地址的长期 reputation 逐渐分化

---

## 1. 环境准备

### 1.1 启动本地 Hardhat 节点

在一个终端里：

```bash
cd ~/depoker2_ws
npx hardhat node
```

保持该终端开着（**不要关**），这样：

- 合约部署在同一条本地链上
- 玩家地址与 reputation 状态会在多次 demo 之间保留

### 1.2 在另一个终端部署 DePoker2

新开一个终端：

```bash
cd ~/depoker2_ws
npx hardhat run --network localhost scripts/deploy_depoker2.js
```

典型输出类似：

```text
DePoker2 deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Saved deployment info to /home/huangu/depoker2_ws/deployments/localhost-DePoker2.json
```

这里有两件事很重要：

1. **合约地址**  
   - 每次重新部署，`DePoker2` 会在本地链上获得一个新的地址。
2. **部署信息 JSON**  
   - 脚本会把 `address` 写进  
     `deployments/localhost-DePoker2.json`  
   - 后面的 demo 会自动从这个 JSON 里读取地址，无需手动改脚本。

---

## 2. 运行随机赢家 Demo（v2）

确保 Hardhat node 仍在运行，然后在任意新终端执行：

```bash
cd ~/depoker2_ws
npx hardhat run --network localhost scripts/demo_depoker2_round_v2.js
```

典型输出结构如下（截取片段）：

```text
Network: localhost, using 10 participants
Using DePoker2 at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Creating room with buy-in = 1 ETH ...
Room created, id = 0
Player 0 (...) joining room ...
...
Player 9 (...) joining room ...
After joins: playerCount = 10 pot = 10.0 ETH

Random winner chosen: Player 6 (0x....)

Starting room ...
Player 0 (...) voting CORRECT for winner 0x....
Player 1 (...) voting for THEMSELVES (0x....) ...
...

Finalizing room ...
Room settled = true winner = 0x....
Reputation scores:
  Player 0 (...): rep = 3
  Player 1 (...): rep = 1
  ...
```

---

## 3. Demo 脚本做了什么？

`demo_depoker2_round_v2.js` 的核心流程：

1. **读取部署信息**
   - 从 `deployments/localhost-DePoker2.json` 读取 `address`
   - 用 `ethers.getContractFactory("DePoker2")` + `.attach(address)` 连接合约

2. **选择参与玩家**

   ```js
   const allSigners = await ethers.getSigners();
   const NUM_PARTICIPANTS = 10; // 默认 10 人：owner + 9 个玩家
   const players = allSigners.slice(0, NUM_PARTICIPANTS);
   ```

3. **创建房间**

   ```js
   const buyIn = ethers.parseEther("1");
   const txCreate = await depoker2.connect(owner).createRoom(buyIn);
   const receipt = await txCreate.wait();
   const ev = receipt.logs.find(l => l.eventName === "RoomCreated");
   const roomId = ev.args.roomId;
   ```

4. **所有玩家依次 `joinRoom`**

   - `players[i].connect(...).joinRoom(roomId, { value: buyIn })`
   - 每人支付 1 ETH，最终 pot = 10 ETH

5. **随机选择本局赢家**

   ```js
   const winnerIndex = Math.floor(Math.random() * NUM_PARTICIPANTS);
   const winner = players[winnerIndex];
   ```

   log 中会显示：

   ```text
   Random winner chosen: Player k (0x....)
   ```

6. **随机挑选 2 个“只投自己”的玩家**

   ```js
   const selfishIndices = [];
   while (selfishIndices.length < 2) {
     const idx = Math.floor(Math.random() * NUM_PARTICIPANTS);
     if (idx === winnerIndex) continue;        // 赢家自己不能作为“瞎投”样本
     if (!selfishIndices.includes(idx)) {
       selfishIndices.push(idx);
     }
   }
   ```

7. **开始房间 & 投票**

   ```js
   await depoker2.connect(owner).startRoom(roomId);

   for (let i = 0; i < NUM_PARTICIPANTS; i++) {
     const player = players[i];
     let voteTarget;

     if (selfishIndices.includes(i)) {
       // 这两个玩家只投自己
       voteTarget = player.address;
       console.log(`Player ${i} (...) voting for THEMSELVES (${player.address}) ...`);
     } else {
       // 其余玩家投给真正赢家
       voteTarget = winner.address;
       console.log(`Player ${i} (...) voting CORRECT for winner ${winner.address} ...`);
     }

     await depoker2.connect(player).voteWinner(roomId, voteTarget);
   }
   ```

8. **结算 & 打印最终 reputation**

   ```js
   await depoker2.connect(owner).finalize(roomId, winner.address);

   for (let i = 0; i < NUM_PARTICIPANTS; i++) {
     const rep = await depoker2.getReputation(players[i].address);
     console.log(`  Player ${i} (...): rep = ${rep.toString()}`);
   }
   ```

   根据当前合约逻辑：

   - 投对的人：`reputation + 1`
   - 投错的人：reputation 不变  
   - 赢家**只是拿 pot，不一定额外加分**（是否给赢家额外奖励取决于合约实现）。

---

## 4. 多次运行脚本会发生什么？

只要你 **不关 Hardhat node**，继续执行：

```bash
npx hardhat run --network localhost scripts/demo_depoker2_round_v2.js
```

就会看到：

- 每次 `Room created, id = 0 / 1 / 2 / ...`，房间编号自增  
- 每局都会随机一个赢家 + 随机两位“自私”玩家  
- `Reputation scores` 中的 rep 会不断在之前的基础上累积

比如多轮之后可能出现：

```text
Player 0: rep = 8
Player 1: rep = 6
Player 2: rep = 7
...
```

这就模拟了：

- 长期“判断准确”的玩家拥有更高 reputation
- 偶尔乱投 / 只投自己的玩家，分数会落后

非常适合后面在前端用图表展示“玩家信誉度变化”。

---

## 5. 可配置项（在 demo 脚本里可改）

在 `scripts/demo_depoker2_round_v2.js` 中，你可以尝试修改：

- `const NUM_PARTICIPANTS = 10;`  
  - 改成 3、5、8 … 来模拟不同人数
- `const buyIn = ethers.parseEther("1");`  
  - 改成 `"0.1"`、`"0.5"` 等
- `NUM_SELFISH = 2;`（如果你把 2 提取成变量）  
  - 增加 / 减少“只投自己”的人数，看 reputation 分布变化

---

## 6. Push 前的小提示

在 `depoker2_ws` 里，大概会新增这些文件：

- `scripts/demo_depoker2_round_v1.js`
- `scripts/demo_depoker2_round_v2.js`
- `deployments/localhost-DePoker2.json`
- `docs/DePoker2-random-demo.md`（如果你用这个文件名）

可以用下面的流程提交：

```bash
cd ~/depoker2_ws
git status
git add scripts/demo_depoker2_round_v1.js \
        scripts/demo_depoker2_round_v2.js \
        deployments/localhost-DePoker2.json \
        docs/DePoker2-random-demo.md
git commit -m "Add random winner reputation demo for DePoker2"
git push origin <your-branch-name>
```

---

（完）
