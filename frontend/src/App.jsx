import { useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  DEPOKER_CONTRACT_ADDRESS,
  DEPOKER_CONTRACT_ABI,
  HARDHAT_CHAIN_ID,
} from "./depokerConfig";

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [network, setNetwork] = useState(null);
  const [contract, setContract] = useState(null);

  const [contractAddress, setContractAddress] = useState(
    DEPOKER_CONTRACT_ADDRESS,
  );

  const [buyInEth, setBuyInEth] = useState("1.0");
  const [roomId, setRoomId] = useState("0");
  const [winnerAddress, setWinnerAddress] = useState("");

  const [roomInfo, setRoomInfo] = useState(null);
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState("");

  // 初始化 provider & 监听 MetaMask 事件
  useEffect(() => {
    if (!window.ethereum) {
      setStatus("MetaMask not detected. Please install it.");
      return;
    }

    const init = async () => {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(browserProvider);

      // 读取当前账号（如果已连接）
      const accounts = await window.ethereum.request({
        method: "eth_accounts",
      });
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        const signer = await browserProvider.getSigner();
        setSigner(signer);
        const net = await browserProvider.getNetwork();
        setNetwork(net);
      }

      // 监听账号变化
      window.ethereum.on("accountsChanged", async (accounts) => {
        if (accounts.length === 0) {
          setAccount("");
          setSigner(null);
          setStatus("Disconnected");
        } else {
          setAccount(accounts[0]);
          const signer = await browserProvider.getSigner();
          setSigner(signer);
          setStatus(`Account changed: ${accounts[0]}`);
        }
      });

      // 监听网络变化
      window.ethereum.on("chainChanged", () => {
        window.location.reload();
      });
    };

    init();
  }, []);

  // signer 或 contractAddress 变化时，更新 contract 实例
  useEffect(() => {
    if (signer && contractAddress) {
      const c = new ethers.Contract(
        contractAddress,
        DEPOKER_CONTRACT_ABI,
        signer,
      );
      setContract(c);
    } else {
      setContract(null);
    }
  }, [signer, contractAddress]);

  // 连接钱包按钮
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const addr = accounts[0];
      setAccount(addr);

      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(browserProvider);
      const signer = await browserProvider.getSigner();
      setSigner(signer);
      const net = await browserProvider.getNetwork();
      setNetwork(net);

      setStatus(`Connected as ${addr}`);
    } catch (err) {
      console.error(err);
      setStatus("Failed to connect wallet");
    }
  };

  // 检查是否连到了 Hardhat 本地链
  const isOnHardhat = network && Number(network.chainId) === HARDHAT_CHAIN_ID;

  // 创建房间
  const handleCreateRoom = async () => {
    if (!contract) {
      alert("Contract is not ready");
      return;
    }
    try {
      setStatus("Creating room...");
      const buyInWei = ethers.parseEther(buyInEth);
      const tx = await contract.createRoom(buyInWei);
      await tx.wait();
      setStatus(`Room created with buy-in ${buyInEth} ETH. (First room id is 0)`);
    } catch (err) {
      console.error(err);
      setStatus(`Create room failed: ${err.reason || err.message}`);
    }
  };

  // 加入房间
  const handleJoinRoom = async () => {
    if (!contract) {
      alert("Contract is not ready");
      return;
    }
    try {
      setStatus("Joining room...");
      const buyInWei = ethers.parseEther(buyInEth);
      const tx = await contract.joinRoom(BigInt(roomId), { value: buyInWei });
      await tx.wait();
      setStatus(`Joined room ${roomId} with ${buyInEth} ETH`);
    } catch (err) {
      console.error(err);
      setStatus(`Join room failed: ${err.reason || err.message}`);
    }
  };

  // 开局
  const handleStartRoom = async () => {
    if (!contract) {
      alert("Contract is not ready");
      return;
    }
    try {
      setStatus("Starting room...");
      const tx = await contract.startRoom(BigInt(roomId));
      await tx.wait();
      setStatus(`Room ${roomId} started`);
    } catch (err) {
      console.error(err);
      setStatus(`Start room failed: ${err.reason || err.message}`);
    }
  };

  // 投票赢家
  const handleVoteWinner = async () => {
    if (!contract) {
      alert("Contract is not ready");
      return;
    }
    if (!winnerAddress) {
      alert("Please input winner address");
      return;
    }
    try {
      setStatus("Voting...");
      const tx = await contract.voteWinner(BigInt(roomId), winnerAddress);
      await tx.wait();
      setStatus(`Voted for winner: ${winnerAddress}`);
    } catch (err) {
      console.error(err);
      setStatus(`Vote failed: ${err.reason || err.message}`);
    }
  };

  // 结算
  const handleFinalize = async () => {
    if (!contract) {
      alert("Contract is not ready");
      return;
    }
    if (!winnerAddress) {
      alert("Please input winner address");
      return;
    }
    try {
      setStatus("Finalizing...");
      const tx = await contract.finalize(BigInt(roomId), winnerAddress);
      await tx.wait();
      setStatus(`Room ${roomId} finalized with winner ${winnerAddress}`);
    } catch (err) {
      console.error(err);
      setStatus(`Finalize failed: ${err.reason || err.message}`);
    }
  };

  // 读取房间信息
  const handleFetchRoom = async () => {
    if (!contract) {
      alert("Contract is not ready");
      return;
    }
    try {
      setStatus("Fetching room info...");
      const room = await contract.getRoom(BigInt(roomId));
      const info = {
        creator: room[0],
        buyIn: ethers.formatEther(room[1]),
        playerCount: room[2].toString(),
        totalPool: ethers.formatEther(room[3]),
        started: room[4],
        settled: room[5],
        winner: room[6],
        createdAt: room[7].toString(),
      };
      setRoomInfo(info);

      const ps = await contract.getPlayers(BigInt(roomId));
      setPlayers(ps);

      setStatus("Room info loaded");
    } catch (err) {
      console.error(err);
      setStatus(`Fetch room failed: ${err.reason || err.message}`);
    }
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "24px",
        maxWidth: "960px",
        margin: "0 auto",
      }}
    >
      <h1>DePoker Demo 🎴</h1>
      <p>
        Local Hardhat network demo – create rooms, join with ETH, vote, and finalize using MetaMask.
      </p>

      {/* 钱包状态 & 连接 */}
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <h2>1. Wallet & Network</h2>
        <button onClick={connectWallet}>Connect MetaMask</button>
        <div style={{ marginTop: "8px" }}>
          <div><strong>Account:</strong> {account || "Not connected"}</div>
          <div>
            <strong>Network:</strong>{" "}
            {network
              ? `${network.name || "Unknown"} (chainId: ${network.chainId})`
              : "Unknown"}
          </div>
          <div>
            <strong>On Hardhat?</strong> {isOnHardhat ? "✅ Yes (31337)" : "⚠️ No"}
          </div>
        </div>
        <p style={{ fontSize: "0.9rem", color: "#555", marginTop: "8px" }}>
          Make sure MetaMask is connected to a custom network:
          RPC <code>http://127.0.0.1:8545</code>, chainId <code>31337</code>.
        </p>
      </section>

      {/* 合约地址配置 */}
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <h2>2. Contract</h2>
        <label style={{ display: "block", marginBottom: "8px" }}>
          Contract address:
          <input
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            style={{ width: "100%", marginTop: "4px" }}
          />
        </label>
        <p style={{ fontSize: "0.9rem", color: "#555" }}>
          Paste the DePoker address printed by{" "}
          <code>scripts/deploy_depoker.js</code>.
        </p>
      </section>

      {/* 房间操作 */}
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <h2>3. Room Actions</h2>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <h3>Create Room</h3>
            <label>
              Buy-in (ETH):
              <input
                type="text"
                value={buyInEth}
                onChange={(e) => setBuyInEth(e.target.value)}
                style={{ width: "100%", marginTop: "4px" }}
              />
            </label>
            <button style={{ marginTop: "8px" }} onClick={handleCreateRoom}>
              Create Room
            </button>
            <p style={{ fontSize: "0.85rem", color: "#555" }}>
              In local demo, first room will be <code>roomId = 0</code>.
            </p>
          </div>

          <div style={{ flex: "1 1 260px" }}>
            <h3>Join Room</h3>
            <label>
              Room ID:
              <input
                type="number"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                style={{ width: "100%", marginTop: "4px" }}
              />
            </label>
            <label>
              Buy-in (ETH):
              <input
                type="text"
                value={buyInEth}
                onChange={(e) => setBuyInEth(e.target.value)}
                style={{ width: "100%", marginTop: "4px" }}
              />
            </label>
            <button style={{ marginTop: "8px" }} onClick={handleJoinRoom}>
              Join Room
            </button>
          </div>

          <div style={{ flex: "1 1 260px" }}>
            <h3>Start / Vote / Finalize</h3>
            <label>
              Room ID:
              <input
                type="number"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                style={{ width: "100%", marginTop: "4px" }}
              />
            </label>
            <label>
              Winner address:
              <input
                type="text"
                value={winnerAddress}
                onChange={(e) => setWinnerAddress(e.target.value)}
                style={{ width: "100%", marginTop: "4px" }}
                placeholder="0x..."
              />
            </label>
            <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button onClick={handleStartRoom}>Start Room</button>
              <button onClick={handleVoteWinner}>Vote Winner</button>
              <button onClick={handleFinalize}>Finalize</button>
            </div>
            <p style={{ fontSize: "0.85rem", color: "#555", marginTop: "4px" }}>
              Only the room creator can call <code>startRoom</code> and{" "}
              <code>finalize</code>. Any joined player can call{" "}
              <code>voteWinner</code>.
            </p>
          </div>
        </div>
      </section>

      {/* 房间信息展示 */}
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <h2>4. Inspect Room</h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label>
            Room ID:
            <input
              type="number"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              style={{ marginLeft: "8px" }}
            />
          </label>
          <button onClick={handleFetchRoom}>Fetch Room Info</button>
        </div>

        {roomInfo && (
          <div style={{ marginTop: "12px" }}>
            <h3>Room {roomId} info</h3>
            <ul>
              <li>
                <strong>Creator:</strong> {roomInfo.creator}
              </li>
              <li>
                <strong>Buy-in:</strong> {roomInfo.buyIn} ETH
              </li>
              <li>
                <strong>Player count:</strong> {roomInfo.playerCount}
              </li>
              <li>
                <strong>Total pool:</strong> {roomInfo.totalPool} ETH
              </li>
              <li>
                <strong>Started:</strong> {roomInfo.started ? "✅" : "❌"}
              </li>
              <li>
                <strong>Settled:</strong> {roomInfo.settled ? "✅" : "❌"}
              </li>
              <li>
                <strong>Winner:</strong> {roomInfo.winner}
              </li>
              <li>
                <strong>createdAt (block timestamp):</strong>{" "}
                {roomInfo.createdAt}
              </li>
            </ul>
          </div>
        )}

        {players.length > 0 && (
          <div style={{ marginTop: "12px" }}>
            <h3>Players</h3>
            <ol>
              {players.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {/* 状态栏 */}
      <section
        style={{
          border: "1px solid #eee",
          borderRadius: "8px",
          padding: "12px",
          backgroundColor: "#fafafa",
          fontSize: "0.9rem",
        }}
      >
        <strong>Status:</strong> {status || "Idle"}
      </section>
    </div>
  );
}

export default App;
