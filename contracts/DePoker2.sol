// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DePoker2 {
    struct Room {
        address creator;
        uint256 buyIn;
        uint256 playerCount;
        uint256 totalPool;
        bool started;
        bool settled;
        address winner;

        address[] players;
        mapping(address => bool) isPlayer;
        mapping(address => bool) hasVoted;
        mapping(address => uint256) votes;
        mapping(address => address) voteChoice;
    }

    struct RoomView {
        address creator;
        uint256 buyIn;
        uint256 playerCount;
        uint256 totalPool;
        bool started;
        bool settled;
        address winner;
    }

    uint256 public nextRoomId;
    mapping(uint256 => Room) private rooms;
    mapping(address => uint256) public reputation;

    event RoomCreated(uint256 indexed roomId, address indexed creator, uint256 buyIn);
    event PlayerJoined(uint256 indexed roomId, address indexed player);
    event RoomStarted(uint256 indexed roomId);
    event VoteCast(uint256 indexed roomId, address indexed voter, address indexed candidate);
    event RoomFinalized(uint256 indexed roomId, address indexed winner, uint256 totalPayout);
    event ReputationUpdated(address indexed player, uint256 newScore);

    modifier roomExists(uint256 roomId) {
        require(roomId < nextRoomId, "room does not exist");
        _;
    }

    function createRoom(uint256 buyInWei) external returns (uint256 roomId) {
        require(buyInWei > 0, "buyIn must be > 0");

        roomId = nextRoomId;
        nextRoomId++;

        Room storage room = rooms[roomId];
        room.creator = msg.sender;
        room.buyIn = buyInWei;

        emit RoomCreated(roomId, msg.sender, buyInWei);
    }

    function joinRoom(uint256 roomId) external payable roomExists(roomId) {
        Room storage room = rooms[roomId];

        require(!room.settled, "room already settled");
        require(!room.started, "room already started");
        require(msg.value == room.buyIn, "incorrect buy-in amount");
        require(!room.isPlayer[msg.sender], "already joined");

        room.isPlayer[msg.sender] = true;
        room.players.push(msg.sender);
        room.playerCount += 1;
        room.totalPool += msg.value;

        emit PlayerJoined(roomId, msg.sender);
    }

    function startRoom(uint256 roomId) external roomExists(roomId) {
        Room storage room = rooms[roomId];

        require(msg.sender == room.creator, "only creator");
        require(!room.started, "already started");
        require(!room.settled, "already settled");
        require(room.playerCount >= 2, "need at least 2 players");

        room.started = true;

        emit RoomStarted(roomId);
    }

    function voteWinner(uint256 roomId, address candidate) external roomExists(roomId) {
        Room storage room = rooms[roomId];

        require(room.started, "room not started");
        require(!room.settled, "room settled");
        require(room.isPlayer[msg.sender], "not a player");
        require(room.isPlayer[candidate], "candidate not in room");
        require(candidate != address(0), "invalid candidate");
        require(!room.hasVoted[msg.sender], "already voted");

        room.hasVoted[msg.sender] = true;
        room.voteChoice[msg.sender] = candidate;
        room.votes[candidate] += 1;

        emit VoteCast(roomId, msg.sender, candidate);
    }

    function finalize(uint256 roomId, address declaredWinner)
        external
        roomExists(roomId)
    {
        Room storage room = rooms[roomId];

        require(msg.sender == room.creator, "only creator");
        require(room.started, "room not started");
        require(!room.settled, "already settled");
        require(room.isPlayer[declaredWinner], "winner not in room");

        uint256 votesForWinner = room.votes[declaredWinner];
        require(votesForWinner * 2 > room.playerCount, "no strict majority");

        uint256 payout = room.totalPool;
        require(payout > 0, "empty pool");

        room.settled = true;
        room.winner = declaredWinner;
        room.totalPool = 0;

        uint256 numPlayers = room.players.length;
        for (uint256 i = 0; i < numPlayers; i++) {
            address p = room.players[i];
            if (room.voteChoice[p] == declaredWinner) {
                reputation[p] += 1;
                emit ReputationUpdated(p, reputation[p]);
            }
        }

        (bool ok, ) = declaredWinner.call{value: payout}("");
        require(ok, "ETH transfer failed");

        emit RoomFinalized(roomId, declaredWinner, payout);
    }

    function getRoom(uint256 roomId)
        external
        view
        roomExists(roomId)
        returns (RoomView memory)
    {
        Room storage room = rooms[roomId];
        return RoomView({
            creator: room.creator,
            buyIn: room.buyIn,
            playerCount: room.playerCount,
            totalPool: room.totalPool,
            started: room.started,
            settled: room.settled,
            winner: room.winner
        });
    }

    function getPlayers(uint256 roomId)
        external
        view
        roomExists(roomId)
        returns (address[] memory)
    {
        Room storage room = rooms[roomId];
        return room.players;
    }

    function getReputation(address player) external view returns (uint256) {
        return reputation[player];
    }
}
