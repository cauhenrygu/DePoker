# DePoker 本地链运行日志（Hardhat Node 输出节选）

## 环境信息

- 启动命令：`npx hardhat node`
- 网络：Hardhat Network (HTTP & WebSocket JSON-RPC at `http://127.0.0.1:8545/`)
- 默认账户（节选）：
  - Account #0: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` （房间创建者 owner）
  - Account #1: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` （玩家 p1）
  - Account #2: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` （玩家 p2）
  - Account #3: `0x90F79bf6EB2c4f870365E785982E1f101E93b906` （玩家 p3）
- 每个账户初始余额：10000 ETH（仅限本地测试网络）

---

## 合约部署

```text
Contract deployment: DePoker
Contract address:    0x5fbdb2315678afecb367f032d93f642f64180aa3
Transaction:         0x201932b3d6efa1ced67043be72bc9c384a3751b0d8d409b78f416ef12a5be17f
From:                0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
Value:               0 ETH
Gas used:            1701057 of 30000000
Block #1:            0xb7ae430dc86d2e6e1990005bd4d7d8c54183ae3e251bc5b0acf421c9e4d47d33


1. 创建房间（createRoom）
Contract call:       DePoker#createRoom
Transaction:         0xe1b25e7eba55300ec0a292161249effa78f373282d928c490ca42cde0ca8e7a9
From:                0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
To:                  0x5fbdb2315678afecb367f032d93f642f64180aa3
Value:               0 ETH
Gas used:            117912 of 30000000
Block #2:            0xbafe28d0b9afb51f1d6bbaf1c7084c52ee6a85e61731a77ec17c94f2dadd7feb


2. 三位玩家加入房间（joinRoom）
Contract call:       DePoker#joinRoom
Transaction:         0x6e5e889159aab303d0672fbb40baf6b4d84440039355ebc8fe4d4fd572b8e2df
From:                0x70997970c51812dc3a010c7d01b50e0d17dc79c8 (p1)
To:                  0x5fbdb2315678afecb367f032d93f642f64180aa3
Value:               1. ETH
Gas used:            117608 of 30000000
Block #3:            0xfa483ebb8d46713a4d60fc7112c4e204bae7f89c62be2c809138bec1e768a206

Contract call:       DePoker#joinRoom
Transaction:         0x4594f92d5975073b974eadd8667607bc359b5fce805e1d6b60280733b91bc6d8
From:                0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc (p2)
To:                  0x5fbdb2315678afecb367f032d93f642f64180aa3
Value:               1. ETH
Gas used:            83408 of 30000000
Block #4:            0xd8f6a09ce8bd70d5cac3d0e088779c06994ccb518b1cfe63544b862361cac678

Contract call:       DePoker#joinRoom
Transaction:         0xbe0d688d556179adb2fc65d1959fcff609a7206256df4414e3778558fd9b6e1e
From:                0x90f79bf6eb2c4f870365e785982e1f101e93b906 (p3)
To:                  0x5fbdb2315678afecb367f032d93f642f64180aa3
Value:               1. ETH
Gas used:            83408 of 30000000
Block #5:            0xfa4b10d4faa4dc3a3fcb5061b1e18b694ef80ad85a0cc91c65dfe2abeb972418


3. 开始房间（startRoom）
Contract call:       DePoker#startRoom
Transaction:         0xe52ccab8081d25ad0117083ec612e0ec4c227e1f03dfc8b886173e1d6548a7dc
From:                0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 (owner)
To:                  0x5fbdb2315678afecb367f032d93f642f64180aa3
Value:               0 ETH
Gas used:            49796 of 30000000
Block #6:            0x417cfcafc2d93b89d18c4ee6cd0adb7545eb9bab6520b0071c53ed47260dd064


4. 投票（voteWinner）
Contract call:       DePoker#voteWinner
Transaction:         0x2777e3fac8bb560ad04d87c1eb21e7ac3f98c5f5abee7fec8e2d08454262c4dc
From:                0x70997970c51812dc3a010c7d01b50e0d17dc79c8 (p1)
To:                  0x5fbdb2315678afecb367f032d93f642f64180aa3
Value:               0 ETH
Gas used:            76214 of 30000000
Block #7:            0x7f5da189d338a526c5b5447381ac84270c674ee703e335772863920bbb9b9490

Contract call:       DePoker#voteWinner
Transaction:         0x361ec5b3bf88c838967bb8112f7da27be9915601084f1126f4b92b03f7bdcc8d
From:                0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc (p2)
To:                  0x5fbdb2315678afecb367f032d93f642f64180aa3
Value:               0 ETH
Gas used:            74214 of 30000000
Block #8:            0xc339662433f26136125e87b46f69f8ec1cb8091b1067a3444ea5fb1d1426097c

Contract call:       DePoker#voteWinner
Transaction:         0x8320900319223721a621d41b6c88f7093a1fd3dc7f686b3f0ee7a92fefede45e
From:                0x90f79bf6eb2c4f870365e785982e1f101e93b906 (p3)
To:                  0x5fbdb2315678afecb367f032d93f642f64180aa3
Value:               0 ETH
Gas used:            74226 of 30000000
Block #9:            0x6149caddfa12ee426fe937f7bfd0476f2f589ffced7b0d7ba037165ebf053752


5. 结算（finalize）
Contract call:       DePoker#finalize
Transaction:         0x64db5a44ee3db2e0bbe5b300b3b3a7b526a7d2ba3f4aed825f6eac6200ef7a87
From:                0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 (owner)
To:                  0x5fbdb2315678afecb367f032d93f642f64180aa3
Value:               0 ETH
Gas used:            58953 of 30000000
Block #10:           0xa84e97ee1359b013eecfbbf7acb71c88445431fae1bfcdd5497f8cefce1e62f3
