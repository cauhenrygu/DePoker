// scripts/demo_depoker2_round_v3.js
// DePoker2 demo: random winners + noisy voters + reputation-based auto-ban,
// without calling depoker2.rooms(...) so it's robust even if there is no public getter.

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Helper: pick k distinct random indices from [0, n)
function pickRandomIndices(n, k) {
  const idx = [...Array(n).keys()]; // [0, 1, 2, ... n-1]
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, k);
}

async function main() {
  const NUM_PARTICIPANTS = 10;                  // number of players (max 19 on hardhat)
  const BUY_IN_ETH = process.env.BUY_IN_ETH || "1.0";

  console.log(`Network: ${network.name}, using ${NUM_PARTICIPANTS} participants`);

  // ---------------------------------------------------------------------------
  // Load deployment info from deployments/localhost-DePoker2.json
  // ---------------------------------------------------------------------------
  const deploymentsPath = path.join(
    __dirname,
    "..",
    "deployments",
    "localhost-DePoker2.json"
  );
  const deploymentRaw = fs.readFileSync(deploymentsPath, "utf8");
  const deployment = JSON.parse(deploymentRaw);

  const contractAddress = deployment.address;
  if (!contractAddress) {
    throw new Error("No 'address' field found in localhost-DePoker2.json");
  }

  const depoker2 = await ethers.getContractAt("DePoker2", contractAddress);
  console.log(`Using DePoker2 at: ${contractAddress}`);

  // ---------------------------------------------------------------------------
  // Accounts:
  //   - signer[0] = owner / room creator
  //   - signer[1..N] = players
  // ---------------------------------------------------------------------------
  const signers = await ethers.getSigners();
  if (signers.length < NUM_PARTICIPANTS + 1) {
    throw new Error(
      `Need at least ${NUM_PARTICIPANTS + 1} accounts (1 owner + ${NUM_PARTICIPANTS} players)`
    );
  }

  const owner = signers[0];
  const participants = signers.slice(1, 1 + NUM_PARTICIPANTS);
  const buyIn = ethers.parseEther(BUY_IN_ETH);

  // ---------------------------------------------------------------------------
  // 1) Create a new room
  // ---------------------------------------------------------------------------
  console.log(`Creating room with buy-in = ${BUY_IN_ETH} ETH ...`);
  const txCreate = await depoker2.connect(owner).createRoom(buyIn);
  await txCreate.wait();

  // We assume DePoker2 exposes a public nextRoomId
  const nextRoomId = await depoker2.nextRoomId();
  const roomId = nextRoomId - 1n;

  console.log(`Room created, id = ${roomId.toString()}`);

  // ---------------------------------------------------------------------------
  // 2) Players attempt to join the room
  //
  // - joinRoom can revert with "reputation too low" if the address is banned.
  // - We treat that as a forced kick-out / auto-ban by the system.
  // ---------------------------------------------------------------------------
  const joined = [];

  for (let i = 0; i < participants.length; i++) {
    const signer = participants[i];
    const addr = await signer.getAddress();

    try {
      console.log(`Player ${i} (${addr}) joining room ...`);
      const txJoin = await depoker2
        .connect(signer)
        .joinRoom(roomId, { value: buyIn });
      await txJoin.wait();
      joined.push({ index: i, signer, addr });
    } catch (err) {
      const msg = (err && err.message) || String(err);
      if (msg.includes("reputation too low")) {
        console.log(
          `Player ${i} (${addr}) FAILED to join – reputation too low (auto-banned).`
        );
      } else if (msg.includes("room already started") || msg.includes("room settled")) {
        console.log(
          `Player ${i} (${addr}) FAILED to join – room not joinable anymore.`
        );
      } else {
        console.log(
          `Player ${i} (${addr}) FAILED to join – unexpected error: ${msg}`
        );
      }
    }
  }

  // We know exactly how many players successfully joined from our local array.
  const playerCountJoined = joined.length;
  const totalPoolEth = playerCountJoined * parseFloat(BUY_IN_ETH);

  console.log(
    `After joins: playerCount (joined) = ${playerCountJoined} ` +
      `expected pot = ${totalPoolEth.toFixed(1)} ETH`
  );

  if (playerCountJoined < 2) {
    console.log(
      "Not enough players successfully joined (need at least 2). Aborting demo."
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // 3) Pick a random winner among the successfully joined players
  // ---------------------------------------------------------------------------
  const winnerSlotIndex = Math.floor(Math.random() * joined.length);
  const winnerSlot = joined[winnerSlotIndex];
  const winnerAddr = winnerSlot.addr;

  console.log(
    `Random winner chosen: Player ${winnerSlot.index} (${winnerAddr})`
  );

  // ---------------------------------------------------------------------------
  // 4) Start the room (only the owner / creator can call startRoom)
  // ---------------------------------------------------------------------------
  console.log("Starting room ...");
  const txStart = await depoker2.connect(owner).startRoom(roomId);
  await txStart.wait();

  // ---------------------------------------------------------------------------
  // 5) Voting phase
  //
  // - Most players vote correctly for the chosen winner.
  // - A small number of "noisy" players vote for themselves (wrong vote).
  // - DePoker2 contract will update reputation based on correct / wrong votes.
  // ---------------------------------------------------------------------------

  // Decide how many noisy voters we want (fewer than half to keep majority).
  let noisyCount;
  if (joined.length >= 5) {
    noisyCount = 2;
  } else if (joined.length >= 3) {
    noisyCount = 1;
  } else {
    noisyCount = 0;
  }

  const noisyIndices = new Set(
    pickRandomIndices(joined.length, noisyCount)
  );

  for (let j = 0; j < joined.length; j++) {
    const { index: playerIndex, signer, addr } = joined[j];

    let candidate;
    if (noisyIndices.has(j)) {
      // noisy / selfish vote: vote for themselves
      candidate = addr;
      console.log(
        `Player ${playerIndex} (${addr}) voting for THEMSELVES (${addr}) ...`
      );
    } else {
      // honest vote: vote for the chosen winner
      candidate = winnerAddr;
      console.log(
        `Player ${playerIndex} (${addr}) voting CORRECT for winner ${winnerAddr} ...`
      );
    }

    const txVote = await depoker2
      .connect(signer)
      .voteWinner(roomId, candidate);
    await txVote.wait();
  }

  // ---------------------------------------------------------------------------
  // 6) Finalize room – owner declares the winner
  //
  //    DePoker2 checks strict majority and:
  //      - Pays the entire on-chain pool to the winner
  //      - Updates reputation for all voters (correct vs wrong)
  // ---------------------------------------------------------------------------
  console.log("Finalizing room ...");
  const txFinalize = await depoker2
    .connect(owner)
    .finalize(roomId, winnerAddr);
  await txFinalize.wait();

  console.log("Room finalized on-chain.");

  // ---------------------------------------------------------------------------
  // 7) Print reputation scores for all participants
  //
  //    Addresses with many correct votes drift positive.
  //    Addresses with repeated wrong votes drift negative.
  //    Once an address falls below the DePoker2 ban threshold, future joinRoom
  //    calls will revert with "reputation too low" and the script will show
  //    them as auto-banned.
  // ---------------------------------------------------------------------------
  console.log("Reputation scores (all configured players):");

  for (let i = 0; i < participants.length; i++) {
    const signer = participants[i];
    const addr = await signer.getAddress();
    const rep = await depoker2.reputation(addr);
    console.log(`  Player ${i} (${addr}): rep = ${rep.toString()}`);
  }
}

// Hardhat entry point
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
