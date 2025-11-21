const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DePoker v2", function () {
  // Common config for rooms
  const BUY_IN = ethers.parseEther("1.0");      // 1 ETH buy-in
  const SMALL_BLIND = ethers.parseEther("0.01");
  const BIG_BLIND = ethers.parseEther("0.02");
  const MAX_PLAYERS = 6;

  // Deploy a fresh DePoker contract and return some signers
  async function deployContract() {
    const [owner, p1, p2, p3, p4, p5, ...rest] = await ethers.getSigners();
    const DePoker = await ethers.getContractFactory("DePoker");
    const depoker = await DePoker.deploy();
    await depoker.waitForDeployment();

    return { depoker, owner, p1, p2, p3, p4, p5 };
  }

  // Helper: create a default room (roomId = 0)
  async function createDefaultRoom(depoker, owner) {
    const tx = await depoker
      .connect(owner)
      .createRoom(BUY_IN, SMALL_BLIND, BIG_BLIND, MAX_PLAYERS);
    await tx.wait();
    const roomId = 0;
    return roomId;
  }

  it("creates a room with correct config and initial runtime state", async function () {
    const { depoker, owner } = await deployContract();
    const roomId = await createDefaultRoom(depoker, owner);

    // Use the helper view to read merged room info
    const [
      creator,
      buyIn,
      playerCount,
      totalPool,
      started,
      settled,
      winner,
      createdAt,
    ] = await depoker.getRoom(roomId);

    expect(creator).to.equal(owner.address);
    expect(buyIn).to.equal(BUY_IN);
    expect(playerCount).to.equal(0n);
    expect(totalPool).to.equal(0n);
    expect(started).to.equal(false);
    expect(settled).to.equal(false);
    expect(winner).to.equal(ethers.ZeroAddress);
    expect(createdAt).to.be.gt(0n);

    // Also check the raw config struct
    const cfg = await depoker.roomConfigs(roomId);
    expect(cfg.buyIn).to.equal(BUY_IN);
    expect(cfg.smallBlind).to.equal(SMALL_BLIND);
    expect(cfg.bigBlind).to.equal(BIG_BLIND);
    expect(cfg.maxPlayers).to.equal(MAX_PLAYERS);
  });

  it("lets players join with exact buy-in and updates pool; rejects incorrect or duplicate joins", async function () {
    const { depoker, owner, p1, p2, p3 } = await deployContract();
    const roomId = await createDefaultRoom(depoker, owner);

    // Correct joins (p1, p2)
    await expect(
      depoker.connect(p1).joinRoom(roomId, { value: BUY_IN }),
    ).to.emit(depoker, "PlayerJoined");

    await expect(
      depoker.connect(p2).joinRoom(roomId, { value: BUY_IN }),
    ).to.emit(depoker, "PlayerJoined");

    // Check room state
    const [, , playerCount, totalPool] = await depoker.getRoom(roomId);
    expect(playerCount).to.equal(2n);
    expect(totalPool).to.equal(BUY_IN * 2n);

    const players = await depoker.getPlayers(roomId);
    expect(players).to.deep.equal([p1.address, p2.address]);

    // Wrong buy-in should revert (use a NEW player p3, to avoid 'already joined')
    const halfBuyIn = BUY_IN / 2n;
    await expect(
      depoker.connect(p3).joinRoom(roomId, { value: halfBuyIn }),
    ).to.be.revertedWith("incorrect buy-in amount");

    // Duplicate join (p1 joins again) should revert
    await expect(
      depoker.connect(p1).joinRoom(roomId, { value: BUY_IN }),
    ).to.be.revertedWith("already joined");
  });

  it("only creator can start room and room must have at least 2 players", async function () {
    const { depoker, owner, p1, p2 } = await deployContract();
    const roomId = await createDefaultRoom(depoker, owner);

    // Only one player joins
    await depoker.connect(p1).joinRoom(roomId, { value: BUY_IN });

    // Non-creator cannot start
    await expect(
      depoker.connect(p1).startRoom(roomId),
    ).to.be.revertedWith("only creator can start");

    // Creator cannot start if not enough players
    await expect(
      depoker.connect(owner).startRoom(roomId),
    ).to.be.revertedWith("not enough players");

    // Second player joins
    await depoker.connect(p2).joinRoom(roomId, { value: BUY_IN });

    // Now creator can start
    await expect(depoker.connect(owner).startRoom(roomId))
      .to.emit(depoker, "RoomStarted")
      .withArgs(roomId, owner.address);

    const [, , , , started, settled] = await depoker.getRoom(roomId);
    expect(started).to.equal(true);
    expect(settled).to.equal(false);
  });

  it("records actions correctly and prevents folded players or non-started rooms from acting", async function () {
    const { depoker, owner, p1, p2, p3 } = await deployContract();
    const roomId = await createDefaultRoom(depoker, owner);

    //
    // 1) room not started → recordAction must revert
    //
    await depoker.connect(p1).joinRoom(roomId, { value: BUY_IN });

    await expect(
      depoker
        .connect(p1)
        .recordAction(roomId, 1 /* ActionType.Check */, 10),
    ).to.be.revertedWith("room not started");

    //
    // 2) 全部玩家在 Open 状态下加入，然后 start，再正常记录行动
    //
    await depoker.connect(p2).joinRoom(roomId, { value: BUY_IN });
    await depoker.connect(p3).joinRoom(roomId, { value: BUY_IN });

    await depoker.connect(owner).startRoom(roomId);

    // p1: Check
    await expect(
      depoker
        .connect(p1)
        .recordAction(roomId, 1 /* ActionType.Check */, 10),
    ).to.emit(depoker, "ActionRecorded");

    // p2: Bet
    await expect(
      depoker
        .connect(p2)
        .recordAction(roomId, 3 /* ActionType.Bet */, 50),
    ).to.emit(depoker, "ActionRecorded");

    // p3: Fold (amount can be 0)
    await expect(
      depoker
        .connect(p3)
        .recordAction(roomId, 0 /* ActionType.Fold */, 0),
    ).to.emit(depoker, "ActionRecorded");

    // Folded player cannot act again
    await expect(
      depoker
        .connect(p3)
        .recordAction(roomId, 2 /* Call */, 10),
    ).to.be.revertedWith("already folded");

    // Check stored actions
    const actions = await depoker.getActions(roomId);
    expect(actions.length).to.equal(3);

    // action[0]: p1 Check
    expect(actions[0].player).to.equal(p1.address);
    expect(Number(actions[0].actionType)).to.equal(1);
    expect(actions[0].amount).to.equal(10n);

    // action[1]: p2 Bet
    expect(actions[1].player).to.equal(p2.address);
    expect(Number(actions[1].actionType)).to.equal(3);
    expect(actions[1].amount).to.equal(50n);

    // action[2]: p3 Fold
    expect(actions[2].player).to.equal(p3.address);
    expect(Number(actions[2].actionType)).to.equal(0);
    expect(actions[2].amount).to.equal(0n);

    // hasFolded should be true for p3
    const foldedP3 = await depoker.hasFolded(roomId, p3.address);
    expect(foldedP3).to.equal(true);
  });

  it("supports majority voting for winner, prevents finalize without majority, and updates reputation", async function () {
    const { depoker, owner, p1, p2, p3, p4 } = await deployContract();

    //
    // Scenario A: 4 players, no strict majority → finalize fails
    //
    const roomIdA = await createDefaultRoom(depoker, owner);

    await depoker.connect(p1).joinRoom(roomIdA, { value: BUY_IN });
    await depoker.connect(p2).joinRoom(roomIdA, { value: BUY_IN });
    await depoker.connect(p3).joinRoom(roomIdA, { value: BUY_IN });
    await depoker.connect(p4).joinRoom(roomIdA, { value: BUY_IN });

    await depoker.connect(owner).startRoom(roomIdA);

    // p1, p2 vote for p2
    await depoker.connect(p1).voteWinner(roomIdA, p2.address);
    await depoker.connect(p2).voteWinner(roomIdA, p2.address);

    // p3, p4 vote for themselves
    await depoker.connect(p3).voteWinner(roomIdA, p3.address);
    await depoker.connect(p4).voteWinner(roomIdA, p4.address);

    // activePlayers = 4, votes(p2) = 2 -> 2 * 2 == 4 -> no strict majority
    await expect(
      depoker.connect(owner).finalize(roomIdA, p2.address),
    ).to.be.revertedWith("no majority for candidate");

    //
    // Scenario B: 3 players, strict majority for p2 → finalize succeeds
    //
    const txB = await depoker
      .connect(owner)
      .createRoom(BUY_IN, SMALL_BLIND, BIG_BLIND, MAX_PLAYERS);
    await txB.wait();
    const roomIdB = 1;

    await depoker.connect(p1).joinRoom(roomIdB, { value: BUY_IN });
    await depoker.connect(p2).joinRoom(roomIdB, { value: BUY_IN });
    await depoker.connect(p3).joinRoom(roomIdB, { value: BUY_IN });

    await depoker.connect(owner).startRoom(roomIdB);

    // p1, p2, p3 all vote for p2（全票通过）
    await depoker.connect(p1).voteWinner(roomIdB, p2.address);
    await depoker.connect(p2).voteWinner(roomIdB, p2.address);
    await depoker.connect(p3).voteWinner(roomIdB, p2.address);

    // Finalize should succeed
    await expect(
      depoker.connect(owner).finalize(roomIdB, p2.address),
    ).to.emit(depoker, "RoomFinalized");

    const [
      ,
      ,
      playerCountB,
      totalPoolB,
      startedB,
      settledB,
      winnerB,
    ] = await depoker.getRoom(roomIdB);

    expect(playerCountB).to.equal(3n);
    expect(totalPoolB).to.equal(0n); // pool emptied on payout
    expect(startedB).to.equal(true);
    expect(settledB).to.equal(true);
    expect(winnerB).to.equal(p2.address);

    // Reputation:
    // - each joined player gets +1
    // - winner gets extra +2 (total +3)
    const repP1 = await depoker.reputation(p1.address);
    const repP2 = await depoker.reputation(p2.address);
    const repP3 = await depoker.reputation(p3.address);

    expect(repP1).to.equal(1n);
    expect(repP2).to.equal(3n);
    expect(repP3).to.equal(1n);
  });

  it("only creator can finalize and candidate must be active player (joined & not folded)", async function () {
    const { depoker, owner, p1, p2, p3 } = await deployContract();
    const roomId = await createDefaultRoom(depoker, owner);

    await depoker.connect(p1).joinRoom(roomId, { value: BUY_IN });
    await depoker.connect(p2).joinRoom(roomId, { value: BUY_IN });
    await depoker.connect(p3).joinRoom(roomId, { value: BUY_IN });

    await depoker.connect(owner).startRoom(roomId);

    // p3 folds → cannot be candidate nor vote
    await depoker.connect(p3).recordAction(roomId, 0 /* Fold */, 0);

    await expect(
      depoker.connect(p3).voteWinner(roomId, p1.address),
    ).to.be.revertedWith("folded player cannot vote");

    // p1, p2 vote for p2
    await depoker.connect(p1).voteWinner(roomId, p2.address);
    await depoker.connect(p2).voteWinner(roomId, p2.address);

    // Non-creator cannot finalize
    await expect(
      depoker.connect(p1).finalize(roomId, p2.address),
    ).to.be.revertedWith("only creator can finalize");

    // Folded candidate cannot be used
    await expect(
      depoker.connect(owner).finalize(roomId, p3.address),
    ).to.be.revertedWith("candidate folded");

    // Creator finalizes with valid candidate (p2)
    await depoker.connect(owner).finalize(roomId, p2.address);

    const [, , , , , settled, winner] = await depoker.getRoom(roomId);
    expect(settled).to.equal(true);
    expect(winner).to.equal(p2.address);
  });
});

