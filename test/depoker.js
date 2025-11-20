const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("DePoker", function () {
  async function deployDePokerFixture() {
    const [owner, p1, p2, p3] = await ethers.getSigners();

    const DePoker = await ethers.getContractFactory("DePoker");
    const depoker = await DePoker.deploy();
    await depoker.waitForDeployment();

    return { depoker, owner, p1, p2, p3 };
  }

  it("creates a room with correct buy-in and initial state", async function () {
    const { depoker, owner } = await loadFixture(deployDePokerFixture);
    const buyIn = ethers.parseEther("1.0");

    const tx = await depoker.connect(owner).createRoom(buyIn);
    await tx.wait();

    const roomId = 0;
    const room = await depoker.getRoom(roomId);

    const [
      creator,
      buyInOut,
      playerCount,
      totalPool,
      started,
      settled,
      winner,
      createdAt,
    ] = room;

    expect(creator).to.equal(owner.address);
    expect(buyInOut).to.equal(buyIn);
    expect(playerCount).to.equal(0n);
    expect(totalPool).to.equal(0n);
    expect(started).to.equal(false);
    expect(settled).to.equal(false);
    expect(winner).to.equal(ethers.ZeroAddress);
  });


  it("lets players join with exact buy-in and updates pool", async function () {
    const { depoker, owner, p1, p2, p3 } = await loadFixture(
      deployDePokerFixture,
    );
    const buyIn = ethers.parseEther("1.0");

    await (await depoker.connect(owner).createRoom(buyIn)).wait();
    const roomId = 0;

    // wrong amount should revert (p1 尚未加入)
    await expect(
      depoker.connect(p1).joinRoom(roomId, { value: buyIn / 2n }),
    ).to.be.revertedWith("incorrect buy-in amount");

    // 正确加入三名玩家
    await depoker.connect(p1).joinRoom(roomId, { value: buyIn });
    await depoker.connect(p2).joinRoom(roomId, { value: buyIn });
    await depoker.connect(p3).joinRoom(roomId, { value: buyIn });

    const roomAfter = await depoker.getRoom(roomId);
    const [, , playerCount, totalPool] = roomAfter;

    expect(playerCount).to.equal(3n);
    expect(totalPool).to.equal(3n * buyIn);

    // same player cannot join twice
    await expect(
      depoker.connect(p1).joinRoom(roomId, { value: buyIn }),
    ).to.be.revertedWith("already joined");
  });


  it("only creator can start and room must have at least 2 players", async function () {
    const { depoker, owner, p1, p2 } = await loadFixture(deployDePokerFixture);
    const buyIn = ethers.parseEther("1.0");

    await (await depoker.connect(owner).createRoom(buyIn)).wait();
    const roomId = 0;

    // one player join
    await depoker.connect(p1).joinRoom(roomId, { value: buyIn });

    // 不足两人，不能 start
    await expect(
      depoker.connect(owner).startRoom(roomId),
    ).to.be.revertedWith("need at least 2 players");

    // 第二个玩家加入
    await depoker.connect(p2).joinRoom(roomId, { value: buyIn });

    // 非创建者不能 start
    await expect(
      depoker.connect(p1).startRoom(roomId),
    ).to.be.revertedWith("only creator can start");

    // 创建者可以 start
    await depoker.connect(owner).startRoom(roomId);
    const room = await depoker.getRoom(roomId);
    const [, , , , started] = room;
    expect(started).to.equal(true);
  });

  it("runs a full 3-player game and pays majority winner", async function () {
    const { depoker, owner, p1, p2, p3 } = await loadFixture(
      deployDePokerFixture,
    );
    const buyIn = ethers.parseEther("1.0");

    await (await depoker.connect(owner).createRoom(buyIn)).wait();
    const roomId = 0;

    await depoker.connect(p1).joinRoom(roomId, { value: buyIn });
    await depoker.connect(p2).joinRoom(roomId, { value: buyIn });
    await depoker.connect(p3).joinRoom(roomId, { value: buyIn });

    await depoker.connect(owner).startRoom(roomId);

    // votes: p1 -> p2, p2 -> p2, p3 -> p3  =>  p2 2 票，p3 1 票
    await depoker.connect(p1).voteWinner(roomId, p2.address);
    await depoker.connect(p2).voteWinner(roomId, p2.address);
    await depoker.connect(p3).voteWinner(roomId, p3.address);

    const before = await ethers.provider.getBalance(p2.address);

    const tx = await depoker.connect(owner).finalize(roomId, p2.address);
    await tx.wait();

    const room = await depoker.getRoom(roomId);
    const [, , playerCount, totalPool, started, settled, winner] = room;

    expect(playerCount).to.equal(3n);
    expect(totalPool).to.equal(0n);
    expect(started).to.equal(true);
    expect(settled).to.equal(true);
    expect(winner).to.equal(p2.address);

    const after = await ethers.provider.getBalance(p2.address);
    expect(after).to.be.gt(before); // 赢了钱（减去少量 gas）
  });
});
