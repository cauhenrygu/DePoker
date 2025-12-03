// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DePoker2 {
    struct Room {
        address creator;
        uint256 buyIn;
        uint256 playerCount;
        uint256 totalPool;
        uint256 totalVotes;

        bool started;
        bool settled;
        address winner;

        address[] players;

        mapping(address => bool) joined;
        mapping(address => bool) hasVoted;
        mapping(address => address) votes;
        mapping(address => uint256) candidateVotes;
    }

    mapping(uint256 => Room) private rooms;
    uint256 public nextRoomId;

    // signed reputation, can go below 0
    mapping(address => int256) public reputation;

    // consecutive wrong votes across rooms
    mapping(address => uint8) public consecutiveWrongVotes;

    // -------- Events --------

    event RoomCreated(uint256 indexed roomId, address indexed creator, uint256 buyIn);
    event PlayerJoined(uint256 indexed roomId, address indexed player, uint256 buyIn);
    event RoomStarted(uint256 indexed roomId);
    event VoteCast(uint256 indexed roomId, address indexed voter, address indexed candidate);
    event RoomFinalized(uint256 indexed roomId, address indexed winner, uint256 totalPayout);

    // -------- External view helpers --------

    function getRoom(uint256 roomId)
        external
        view
        returns (
            address creator,
            uint256 buyIn,
            uint256 playerCount,
            uint256 totalPool,
            uint256 totalVotes,
            bool started,
            bool settled,
            address winner
        )
    {
        Room storage r = rooms[roomId];
        return (
            r.creator,
            r.buyIn,
            r.playerCount,
            r.totalPool,
            r.totalVotes,
            r.started,
            r.settled,
            r.winner
        );
    }

    function getReputation(address player) external view returns (int256) {
        return reputation[player];
    }

    // -------- Core room lifecycle --------

    function createRoom(uint256 buyIn) external returns (uint256 roomId) {
        require(buyIn > 0, "buy-in must be > 0");

        roomId = nextRoomId;
        nextRoomId += 1;

        Room storage room = rooms[roomId];
        room.creator = msg.sender;
        room.buyIn = buyIn;

        emit RoomCreated(roomId, msg.sender, buyIn);
    }

    function joinRoom(uint256 roomId) external payable {
        Room storage room = rooms[roomId];
        require(room.creator != address(0), "room does not exist");
        require(!room.started, "room already started");
        require(!room.settled, "room already settled");
        require(msg.value == room.buyIn, "incorrect buy-in amount");
        require(!room.joined[msg.sender], "already joined");
        // block players with reputation strictly below -100
        require(reputation[msg.sender] >= -3, "reputation too low");

        room.joined[msg.sender] = true;
        room.players.push(msg.sender);
        room.playerCount += 1;
        room.totalPool += msg.value;

        emit PlayerJoined(roomId, msg.sender, msg.value);
    }

    function startRoom(uint256 roomId) external {
        Room storage room = rooms[roomId];
        require(room.creator != address(0), "room does not exist");
        require(msg.sender == room.creator, "only creator can start");
        require(!room.started, "room already started");
        require(!room.settled, "room already settled");
        require(room.playerCount >= 2, "need at least 2 players");

        room.started = true;

        emit RoomStarted(roomId);
    }

    function voteWinner(uint256 roomId, address candidate) external {
        Room storage room = rooms[roomId];
        require(room.creator != address(0), "room does not exist");
        require(room.started, "room not started");
        require(!room.settled, "room already settled");
        require(room.joined[msg.sender], "only players can vote");
        require(room.joined[candidate], "candidate must be a player");
        require(!room.hasVoted[msg.sender], "already voted");

        room.hasVoted[msg.sender] = true;
        room.votes[msg.sender] = candidate;

        room.candidateVotes[candidate] += 1;
        room.totalVotes += 1;

        emit VoteCast(roomId, msg.sender, candidate);
    }

    function finalize(uint256 roomId, address declaredWinner) external {
        Room storage room = rooms[roomId];
        require(room.creator != address(0), "room does not exist");
        require(msg.sender == room.creator, "only creator can finalize");
        require(room.started, "room not started");
        require(!room.settled, "room already settled");
        require(room.playerCount > 0, "no players");
        require(room.joined[declaredWinner], "winner must be a player");
        require(room.totalVotes > 0, "no votes cast");

        uint256 votesForWinner = room.candidateVotes[declaredWinner];
        require(votesForWinner * 2 > room.totalVotes, "no strict majority");

        uint256 payout = room.totalPool;

        room.winner = declaredWinner;
        room.settled = true;
        room.totalPool = 0;

        _updateReputation(room, declaredWinner);

        (bool ok, ) = declaredWinner.call{value: payout}("");
        require(ok, "payout failed");

        emit RoomFinalized(roomId, declaredWinner, payout);
    }

    // -------- Internal reputation logic --------

    function _updateReputation(Room storage room, address winner) internal {
        for (uint256 i = 0; i < room.playerCount; i++) {
            address player = room.players[i];

            if (player == winner) {
                reputation[player] += int256(1);
            }

            if (!room.hasVoted[player]) {
                continue;
            }

            address votedFor = room.votes[player];
            bool votedCorrect = (votedFor == winner);

            if (votedCorrect) {
                reputation[player] += int256(1);
                consecutiveWrongVotes[player] = 0;
            } else {
                uint8 newCount = consecutiveWrongVotes[player] + 1;
                consecutiveWrongVotes[player] = newCount;

                if (newCount >= 2) {
                    reputation[player] -= int256(10);
                    consecutiveWrongVotes[player] = 0;
                } else {
                    reputation[player] -= int256(1);
                }
            }
        }
    }

    // -------- Safety --------

    receive() external payable {
        revert("direct ETH transfers not allowed");
    }

    fallback() external payable {
        revert("unknown function");
    }
}
