// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title DePoker 简化版：赢家通吃 + 投票结算
/// @notice 功能：
/// 1. 创建房间（设置 buy-in 金额）
/// 2. 玩家按 buy-in 金额用 ETH 加入房间
/// 3. 开始游戏（锁定加入）
/// 4. 玩家投票选出赢家
/// 5. 按多数票结算（> 50% 玩家投同一个人）
/// 6. 将资金直接打给赢家
contract DePoker {
    struct Room {
        address creator;       // 房间创建者
        uint256 buyIn;         // 每个玩家的买入金额（单位：wei）
        address[] players;     // 玩家列表
        uint256 totalPool;     // 总奖池
        bool started;          // 是否已经开始（开始后不能再加人）
        bool settled;          // 是否已经结算
        address winner;        // 最终赢家
        uint256 createdAt;     // 创建时间
    }

    uint256 public roomCount;              // 房间总数，自增 ID
    mapping(uint256 => Room) private rooms;

    // 房间内状态：是否加入 / 投给谁
    mapping(uint256 => mapping(address => bool)) public joined;        // roomId => player => joined?
    mapping(uint256 => mapping(address => address)) public voteFor;    // roomId => voter => candidate
    mapping(uint256 => mapping(address => bool)) public hasVoted;      // roomId => voter => voted?

    event RoomCreated(uint256 indexed roomId, address indexed creator, uint256 buyIn);
    event Joined(uint256 indexed roomId, address indexed player, uint256 amount);
    event Started(uint256 indexed roomId);
    event Voted(uint256 indexed roomId, address indexed voter, address indexed candidate);
    event Settled(uint256 indexed roomId, address indexed winner, uint256 amount);

    /// @notice 创建一个新房间，指定 buy-in（单位：wei）
    function createRoom(uint256 _buyIn) external returns (uint256) {
        require(_buyIn > 0, "buy-in must > 0");

        uint256 id = roomCount;
        roomCount++;

        Room storage r = rooms[id];
        r.creator = msg.sender;
        r.buyIn = _buyIn;
        r.totalPool = 0;
        r.started = false;
        r.settled = false;
        r.winner = address(0);
        r.createdAt = block.timestamp;

        emit RoomCreated(id, msg.sender, _buyIn);
        return id;
    }

    /// @notice 玩家加入房间并支付 buy-in 金额（用 ETH）
    function joinRoom(uint256 roomId) external payable {
        Room storage r = rooms[roomId];
        require(!r.started, "room already started");
        require(!r.settled, "room already settled");
        require(r.buyIn > 0, "room not exist");
        require(!joined[roomId][msg.sender], "already joined");
        require(msg.value == r.buyIn, "incorrect buy-in amount");

        joined[roomId][msg.sender] = true;
        r.players.push(msg.sender);
        r.totalPool += msg.value;

        emit Joined(roomId, msg.sender, msg.value);
    }

    /// @notice 创建者开始游戏，开始后不能再 join
    function startRoom(uint256 roomId) external {
        Room storage r = rooms[roomId];
        require(msg.sender == r.creator, "only creator can start");
        require(!r.started, "already started");
        require(!r.settled, "already settled");
        require(r.players.length >= 2, "need at least 2 players");

        r.started = true;
        emit Started(roomId);
    }

    /// @notice 玩家给某个玩家投票（必须是房间内玩家）
    function voteWinner(uint256 roomId, address candidate) external {
        Room storage r = rooms[roomId];
        require(r.started, "room not started");
        require(!r.settled, "room already settled");
        require(joined[roomId][msg.sender], "you are not in this room");
        require(joined[roomId][candidate], "candidate not in room");
        require(!hasVoted[roomId][msg.sender], "already voted");

        voteFor[roomId][msg.sender] = candidate;
        hasVoted[roomId][msg.sender] = true;

        emit Voted(roomId, msg.sender, candidate);
    }

    /// @notice 任何人都可以调用结算函数，按多数票计算赢家
    /// @dev 规则：得票数 > players.length / 2 即为赢家
    function finalize(uint256 roomId, address candidate) external {
        Room storage r = rooms[roomId];
        require(r.started, "room not started");
        require(!r.settled, "already settled");
        require(joined[roomId][candidate], "candidate not in room");

        uint256 votes = 0;
        uint256 len = r.players.length;

        // 统计候选人的得票数
        for (uint256 i = 0; i < len; i++) {
            address p = r.players[i];
            if (voteFor[roomId][p] == candidate) {
                votes++;
            }
        }

        require(votes * 2 > len, "no majority for candidate");

        r.settled = true;
        r.winner = candidate;

        uint256 amount = r.totalPool;
        r.totalPool = 0;

        // 直接把奖池打给赢家（本地测试用，正式版建议用 withdraw 模式）
        payable(candidate).transfer(amount);

        emit Settled(roomId, candidate, amount);
    }

    /// @notice 查看房间基础信息（不含 mapping）
    function getRoom(uint256 roomId) external view returns (
        address creator,
        uint256 buyIn,
        uint256 playerCount,
        uint256 totalPool,
        bool started,
        bool settled,
        address winner,
        uint256 createdAt
    ) {
        Room storage r = rooms[roomId];
        return (
            r.creator,
            r.buyIn,
            r.players.length,
            r.totalPool,
            r.started,
            r.settled,
            r.winner,
            r.createdAt
        );
    }

    /// @notice 获取房间所有玩家列表
    function getPlayers(uint256 roomId) external view returns (address[] memory) {
        return rooms[roomId].players;
    }
}
