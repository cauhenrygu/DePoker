const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DePoker v2", function () {
    async function deployDePokerWithRoom() {
        const [owner, p1, p2, p3, p4, p5] = await ethers.getSigners();

        const DePoker = await ethers.getContractFactory("DePoker");
        const depoker = await DePoker.deploy();
        await depoker.waitForDeployment();

        const buyIn = ethers.parseEther("1.0");
        const smallBlind = ethers.parseEther("0.1");
        const bigBlind = ethers.parseEther("0.2");
        const maxPlayers = 6;

        const tx = await depoker.createRoom(
            buyIn,
            smallBlind,
            bigBlind,
            maxPlayers
        );
        await tx.wait();

        const roomId = 0;

        return {
            depoker,
            owner,
            p1,
            p2,
            p3,
            p4,
            p5,
            roomId,
            buyIn,
            smallBlind,
            bigBlind,
            maxPlayers,
        };
    }

    it("creates a room with correct config and initial runtime state", async function () {
        const {
            depoker,
            owner,
            roomId,
            buyIn,
            smallBlind,
            bigBlind,
            maxPlayers,
        } = await deployDePokerWithRoom();

        const config = await depoker.roomConfigs(roomId);
        expect(config.buyIn).to.equal(buyIn);
        expect(config.smallBlind).to.equal(smallBlind);
        expect(config.bigBlind).to.equal(bigBlind);
        expect(config.maxPlayers).to.equal(maxPlayers);

        const runtime = await depoker.roomRuntime(roomId);
        expect(runtime.creator).to.equal(owner.address);
        expect(runtime.playerCount).to.equal(0n);
        expect(runtime.totalPool).to.equal(0n);
        expect(runtime.state).to.equal(0); // RoomState.Open

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
        expect(createdAt).to.be.greaterThan(0n);
    });

    it("lets players join with exact buy-in and updates pool; rejects incorrect or duplicate joins", async function () {
        const { depoker, roomId, buyIn, p1, p2, p3 } =
            await deployDePokerWithRoom();

        // 正常 join：p1
        await expect(
            depoker.connect(p1).joinRoom(roomId, { value: buyIn })
        ).to.not.be.reverted;

        // 房间状态更新
        let room = await depoker.getRoom(roomId);
        let [, , playerCount, totalPool] = room;
        expect(playerCount).to.equal(1n);
        expect(totalPool).to.equal(buyIn);

        // 错误金额：p2
        await expect(
            depoker
                .connect(p2)
                .joinRoom(roomId, { value: buyIn - 1n })
        ).to.be.revertedWith("incorrect buy-in amount");

        // 正常 join：p2
        await depoker.connect(p2).joinRoom(roomId, { value: buyIn });

        room = await depoker.getRoom(roomId);
        [, , playerCount, totalPool] = room;
        expect(playerCount).to.equal(2n);
        expect(totalPool).to.equal(buyIn * 2n);

        // 重复 join：p1
        await expect(
            depoker.connect(p1).joinRoom(roomId, { value: buyIn })
        ).to.be.revertedWith("already joined");

        // 额外测试：把房间塞满，然后再多一个人
        // 当前 maxPlayers = 6，已经有 p1/p2，再加 p3,p4,p5,owner
        const [owner, , , , p4, p5] = await ethers.getSigners();

        await depoker.connect(p3).joinRoom(roomId, { value: buyIn });
        await depoker.connect(p4).joinRoom(roomId, { value: buyIn });
        await depoker.connect(p5).joinRoom(roomId, { value: buyIn });
        await depoker.connect(owner).joinRoom(roomId, { value: buyIn });

        room = await depoker.getRoom(roomId);
        [, , playerCount] = room;
        expect(playerCount).to.equal(6n);

        // 再多一个人加入 -> room full
        const extra = (await ethers.getSigners())[6];
        await expect(
            depoker.connect(extra).joinRoom(roomId, { value: buyIn })
        ).to.be.revertedWith("room full");
    });

    it("only creator can start room and room must have at least 2 players", async function () {
        const { depoker, owner, roomId, buyIn, p1, p2 } =
            await deployDePokerWithRoom();

        // 只有一个玩家时，creator 想 start -> not enough players
        await depoker.connect(p1).joinRoom(roomId, { value: buyIn });

        await expect(
            depoker.connect(owner).startRoom(roomId)
        ).to.be.revertedWith("not enough players");

        // 第二个玩家加入
        await depoker.connect(p2).joinRoom(roomId, { value: buyIn });

        // 非 creator 不能 start
        await expect(
            depoker.connect(p1).startRoom(roomId)
        ).to.be.revertedWith("only creator can start");

        // creator 正常 start
        await depoker.connect(owner).startRoom(roomId);

        const runtime = await depoker.roomRuntime(roomId);
        expect(runtime.state).to.equal(1); // RoomState.Started

        const room = await depoker.getRoom(roomId);
        const [, , , , started, settled] = room;
        expect(started).to.equal(true);
        expect(settled).to.equal(false);
    });

    it("records actions correctly and prevents folded players or non-started rooms from acting", async function () {
        const { depoker, owner, roomId, buyIn, p1, p2, p3 } =
            await deployDePokerWithRoom();

        // 两个玩家加入
        await depoker.connect(p1).joinRoom(roomId, { value: buyIn });
        await depoker.connect(p2).joinRoom(roomId, { value: buyIn });

        // 未 start 时不能 action
        await expect(
            depoker
                .connect(p1)
                .recordAction(roomId, 1, 0) // Check
        ).to.be.revertedWith("room not started");

        // start 房间
        await depoker.connect(owner).startRoom(roomId);

        // 非玩家不能 action
        await expect(
            depoker
                .connect(p3)
                .recordAction(roomId, 3, 100n) // Bet
        ).to.be.revertedWith("not a player");

        // Check：amount 必须是 0
        await expect(
            depoker
                .connect(p1)
                .recordAction(roomId, 1, 1n) // Check with non-zero
        ).to.be.revertedWith("amount must be 0 for check");

        await expect(
            depoker
                .connect(p1)
                .recordAction(roomId, 1, 0) // Check with 0
        ).to.not.be.reverted;

        // Bet / Raise / Call：amount 必须 > 0
        await expect(
            depoker
                .connect(p1)
                .recordAction(roomId, 3, 0) // Bet with 0
        ).to.be.revertedWith("amount must be > 0 for this action");

        await expect(
            depoker
                .connect(p1)
                .recordAction(roomId, 3, 100n) // Bet with >0
        ).to.not.be.reverted;

        // Fold：会标记 hasFolded，之后不能再 action
        await expect(
            depoker
                .connect(p1)
                .recordAction(roomId, 0, 123n) // Fold with non-zero -> 合约会强制 amount=0
        ).to.not.be.reverted;

        const folded = await depoker.hasFolded(roomId, p1.address);
        expect(folded).to.equal(true);

        // Fold 之后再 action -> already folded
        await expect(
            depoker
                .connect(p1)
                .recordAction(roomId, 3, 100n)
        ).to.be.revertedWith("already folded");

        // 再检查 actions 列表长度 > 0
        const actions = await depoker.getActions(roomId);
        expect(actions.length).to.be.greaterThan(0);
    });

    it("supports majority voting for winner, prevents finalize without majority, and updates reputation", async function () {
        const { depoker, owner, roomId, buyIn, p1, p2, p3 } =
            await deployDePokerWithRoom();

        // 三个玩家加入
        await depoker.connect(p1).joinRoom(roomId, { value: buyIn });
        await depoker.connect(p2).joinRoom(roomId, { value: buyIn });
        await depoker.connect(p3).joinRoom(roomId, { value: buyIn });

        // start 房间
        await depoker.connect(owner).startRoom(roomId);

        // p3 先 Fold（active players = p1, p2）
        await depoker
            .connect(p3)
            .recordAction(roomId, 0, 0); // Fold

        // 只有 p1 给 p2 投票：activePlayers = 2（p1,p2）， votes[p2] = 1 -> 没有 strict majority
        await depoker.connect(p1).voteWinner(roomId, p2.address);

        await expect(
            depoker.connect(owner).finalize(roomId, p2.address)
        ).to.be.revertedWith("no majority for candidate");

        // p2 自己也投给自己 -> votes[p2] = 2, activePlayers = 2 -> strict majority
        await depoker.connect(p2).voteWinner(roomId, p2.address);

        await expect(
            depoker.connect(owner).finalize(roomId, p2.address)
        ).to.not.be.reverted;

        const runtime = await depoker.roomRuntime(roomId);
        expect(runtime.state).to.equal(2); // RoomState.Settled
        expect(runtime.winner).to.equal(p2.address);
        expect(runtime.totalPool).to.equal(0n);

        // reputation:
        // 每个 joined 玩家 +1，winner 再 +2
        const rep1 = await depoker.reputation(p1.address);
        const rep2 = await depoker.reputation(p2.address);
        const rep3 = await depoker.reputation(p3.address);

        expect(rep1).to.equal(1n);
        expect(rep3).to.equal(1n);
        expect(rep2).to.equal(3n);
    });

    it("only creator can finalize and candidate must be active player (joined & not folded)", async function () {
        const {
            depoker,
            owner,
            roomId,
            buyIn,
            p1,
            p2,
            p3,
        } = await deployDePokerWithRoom();

        // ------- 场景 1：only creator can finalize -------

        // 三人加入
        await depoker.connect(p1).joinRoom(roomId, { value: buyIn });
        await depoker.connect(p2).joinRoom(roomId, { value: buyIn });
        await depoker.connect(p3).joinRoom(roomId, { value: buyIn });

        await depoker.connect(owner).startRoom(roomId);

        // p1 和 p3 都给 p2 投票，形成 majority
        await depoker.connect(p1).voteWinner(roomId, p2.address);
        await depoker.connect(p3).voteWinner(roomId, p2.address);

        // 非 creator 尝试 finalize -> revert
        await expect(
            depoker.connect(p1).finalize(roomId, p2.address)
        ).to.be.revertedWith("only creator can finalize");

        // creator 可以正常 finalize
        await expect(
            depoker.connect(owner).finalize(roomId, p2.address)
        ).to.not.be.reverted;

        const runtimeAfter = await depoker.roomRuntime(roomId);
        expect(runtimeAfter.state).to.equal(2); // Settled
        expect(runtimeAfter.winner).to.equal(p2.address);

        // ------- 场景 2：candidate must be active (joined & not folded) -------

        // 新建第二个房间
        const buyIn2 = ethers.parseEther("0.5");
        const sb2 = ethers.parseEther("0.05");
        const bb2 = ethers.parseEther("0.1");
        const maxPlayers2 = 3;

        const tx2 = await depoker.createRoom(
            buyIn2,
            sb2,
            bb2,
            maxPlayers2
        );
        await tx2.wait();
        const roomId2 = 1;

        // p1, p2 加入第二个房间
        await depoker.connect(p1).joinRoom(roomId2, { value: buyIn2 });
        await depoker.connect(p2).joinRoom(roomId2, { value: buyIn2 });

        await depoker.connect(owner).startRoom(roomId2);

        // 让 p2 fold
        await depoker
            .connect(p2)
            .recordAction(roomId2, 0, 0); // Fold

        // candidate = p2，但已经 folded -> finalize 必须 revert "candidate folded"
        await expect(
            depoker.connect(owner).finalize(roomId2, p2.address)
        ).to.be.revertedWith("candidate folded");
    });
});

