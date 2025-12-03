const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DePoker2 basic flow", function () {
  let depoker2;
  let owner, p1, p2;

  beforeEach(async function () {
    [owner, p1, p2] = await ethers.getSigners();
    const DePoker2 = await ethers.getContractFactory("DePoker2");
    depoker2 = await DePoker2.deploy();
    await depoker2.waitForDeployment();
  });

  it("runs a full room lifecycle and updates reputation", async function () {
    const buyIn = ethers.parseEther("1");

    // owner create room
    await depoker2.connect(owner).createRoom(buyIn);
    const nextId = await depoker2.nextRoomId();
    const roomId = nextId - 1n;

    // p1, p2 join with exact buy-in
    await depoker2.connect(p1).joinRoom(roomId, { value: buyIn });
    await depoker2.connect(p2).joinRoom(roomId, { value: buyIn });

    // owner start room
    await depoker2.connect(owner).startRoom(roomId);

    // both vote p1 as winner
    await depoker2.connect(p1).voteWinner(roomId, p1.address);
    await depoker2.connect(p2).voteWinner(roomId, p1.address);

    const balanceBefore = await ethers.provider.getBalance(p1.address);

    // finalize by owner
    const txFinalize = await depoker2
      .connect(owner)
      .finalize(roomId, p1.address);
    await txFinalize.wait();

    const balanceAfter = await ethers.provider.getBalance(p1.address);

    // p1 get money from pool（2 * buyIn - gas）
    expect(balanceAfter).to.be.gt(balanceBefore);

    const rep1 = await depoker2.getReputation(p1.address);
    const rep2 = await depoker2.getReputation(p2.address);

    // both reputation +1
    expect(rep1).to.equal(1n);
    expect(rep2).to.equal(1n);
  });
});
