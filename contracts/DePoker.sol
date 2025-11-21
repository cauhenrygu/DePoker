// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title DePoker v2
/// @notice On-chain bookkeeping & settlement layer for offline Texas Hold'em.
///         - All dealing and gameplay happen offline.
///         - The contract only records: buy-in, actions, winner voting, payout, and simple reputation.
contract DePoker {
    // -------- Enums --------

    /// @notice Room lifecycle.
    enum RoomState {
        Open,    // players can join
        Started, // game in progress, actions/votes allowed
        Settled  // winner decided, prize paid
    }

    /// @notice Player action types (for logging only, contract does not enforce poker rules).
    enum ActionType {
        Fold,
        Check,
        Call,
        Bet,
        Raise
    }

    // -------- Structs --------

    /// @notice Static configuration of a room.
    struct RoomConfig {
        uint256 buyIn;      // fixed buy-in amount in wei per player
        uint256 smallBlind; // small blind (for off-chain reference only)
        uint256 bigBlind;   // big blind (for off-chain reference only)
        uint8   maxPlayers; // maximum number of players allowed
    }

    /// @notice Runtime state of a room.
    struct RoomRuntime {
        address creator;     // table host / room creator
        uint256 playerCount; // number of joined players
        uint256 totalPool;   // total ETH locked in this room
        RoomState state;     // Open / Started / Settled
        address winner;      // final winner address (if settled)
        uint256 createdAt;   // block timestamp at creation
    }

    /// @notice A single action performed by a player in a room.
    struct Action {
        address player;
        ActionType actionType;
        uint256 amount;   // chip amount declared for this action (no extra ETH transfer)
        uint256 timestamp;
    }

    // -------- Storage --------

    uint256 public nextRoomId;

    /// @notice roomId => static config
    mapping(uint256 => RoomConfig) public roomConfigs;

    /// @notice roomId => runtime state
    mapping(uint256 => RoomRuntime) public roomRuntime;

    /// @notice roomId => list of joined players
    mapping(uint256 => address[]) private roomPlayers;

    /// @notice roomId + player => whether joined
    mapping(uint256 => mapping(address => bool)) public hasJoined;

    /// @notice roomId + player => whether folded (cannot act anymore, but can still vote)
    mapping(uint256 => mapping(address => bool)) public hasFolded;

    /// @notice roomId => list of all actions in this room
    mapping(uint256 => Action[]) private roomActions;

    /// @notice roomId + player => whether already voted for winner
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    /// @notice roomId + candidate => number of votes received
    mapping(uint256 => mapping(address => uint256)) public voteCount;

    /// @notice simple per-address reputation score
    mapping(address => uint256) public reputation;

    // -------- Events --------

    event RoomCreated(
        uint256 indexed roomId,
        address indexed creator,
        uint256 buyIn,
        uint256 smallBlind,
        uint256 bigBlind,
        uint8 maxPlayers,
        uint256 timestamp
    );

    event PlayerJoined(
        uint256 indexed roomId,
        address indexed player,
        uint256 buyIn
    );

    event RoomStarted(
        uint256 indexed roomId,
        address indexed creator
    );

    event ActionRecorded(
        uint256 indexed roomId,
        address indexed player,
        ActionType actionType,
        uint256 amount,
        uint256 timestamp
    );

    event WinnerVoted(
        uint256 indexed roomId,
        address indexed voter,
        address indexed candidate
    );

    event RoomFinalized(
        uint256 indexed roomId,
        address indexed winner,
        uint256 totalPayout,
        uint256 timestamp
    );

    // -------- Internal helpers --------

    /// @dev Revert if room does not exist.
    function _roomExists(uint256 roomId) internal view {
        require(roomRuntime[roomId].creator != address(0), "room does not exist");
    }

    /// @dev Count the number of active players: joined and NOT folded.
    function _countActivePlayers(uint256 roomId) internal view returns (uint256 count) {
        address[] storage players = roomPlayers[roomId];
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            if (hasJoined[roomId][p] && !hasFolded[roomId][p]) {
                count += 1;
            }
        }
    }

    /// @dev Simple reputation update after a successfully finalized room.
    ///      - Every joined player gets +1
    ///      - Winner gets +2 extra (total +3)
    function _updateReputationAfterFinalize(uint256 roomId, address winner) internal {
        address[] storage players = roomPlayers[roomId];
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            if (hasJoined[roomId][p]) {
                reputation[p] += 1;
            }
        }
        reputation[winner] += 2;
    }

    // -------- Public view helpers --------

    /// @notice Human-friendly room view, compatible with your earlier v1 getRoom API.
    /// @dev This merges config + runtime into a flat tuple.
    function getRoom(uint256 roomId)
        external
        view
        returns (
            address creator,
            uint256 buyIn,
            uint256 playerCount,
            uint256 totalPool,
            bool started,
            bool settled,
            address winner,
            uint256 createdAt
        )
    {
        RoomRuntime storage rt = roomRuntime[roomId];
        RoomConfig storage cfg = roomConfigs[roomId];
        require(rt.creator != address(0), "room does not exist");

        creator = rt.creator;
        buyIn = cfg.buyIn;
        playerCount = rt.playerCount;
        totalPool = rt.totalPool;
        started = (rt.state == RoomState.Started || rt.state == RoomState.Settled);
        settled = (rt.state == RoomState.Settled);
        winner = rt.winner;
        createdAt = rt.createdAt;
    }

    /// @notice Get the list of all joined players in a room.
    function getPlayers(uint256 roomId) external view returns (address[] memory) {
        _roomExists(roomId);
        return roomPlayers[roomId];
    }

    /// @notice Get the list of all recorded actions in a room.
    function getActions(uint256 roomId) external view returns (Action[] memory) {
        _roomExists(roomId);
        Action[] storage stored = roomActions[roomId];
        Action[] memory out = new Action[](stored.length);
        for (uint256 i = 0; i < stored.length; i++) {
            out[i] = stored[i];
        }
        return out;
    }

    // -------- Core logic --------

    /// @notice Create a new poker room.
    /// @param buyIn Fixed buy-in per player (in wei).
    /// @param smallBlind Small blind (for off-chain reference).
    /// @param bigBlind Big blind (for off-chain reference, must be >= smallBlind).
    /// @param maxPlayers Maximum number of players allowed in this room (e.g. 2~10).
    function createRoom(
        uint256 buyIn,
        uint256 smallBlind,
        uint256 bigBlind,
        uint8 maxPlayers
    ) external returns (uint256 roomId) {
        require(buyIn > 0, "buy-in must be > 0");
        require(smallBlind > 0, "small blind must be > 0");
        require(bigBlind >= smallBlind, "big blind >= small blind");
        require(maxPlayers >= 2, "maxPlayers >= 2");
        require(maxPlayers <= 10, "maxPlayers too large");

        roomId = nextRoomId++;
        roomConfigs[roomId] = RoomConfig({
            buyIn: buyIn,
            smallBlind: smallBlind,
            bigBlind: bigBlind,
            maxPlayers: maxPlayers
        });

        roomRuntime[roomId] = RoomRuntime({
            creator: msg.sender,
            playerCount: 0,
            totalPool: 0,
            state: RoomState.Open,
            winner: address(0),
            createdAt: block.timestamp
        });

        emit RoomCreated(
            roomId,
            msg.sender,
            buyIn,
            smallBlind,
            bigBlind,
            maxPlayers,
            block.timestamp
        );
    }

    /// @notice Join an open room by sending the exact buy-in amount.
    function joinRoom(uint256 roomId) external payable {
        _roomExists(roomId);

        RoomRuntime storage rt = roomRuntime[roomId];
        RoomConfig storage cfg = roomConfigs[roomId];

        require(rt.state == RoomState.Open, "room not open");
        require(!hasJoined[roomId][msg.sender], "already joined");
        require(rt.playerCount < cfg.maxPlayers, "room full");
        require(msg.value == cfg.buyIn, "incorrect buy-in amount");

        hasJoined[roomId][msg.sender] = true;
        roomPlayers[roomId].push(msg.sender);
        rt.playerCount += 1;
        rt.totalPool += msg.value;

        emit PlayerJoined(roomId, msg.sender, msg.value);
    }

    /// @notice Start the room. Only the creator can start, and requires at least 2 players.
    function startRoom(uint256 roomId) external {
        _roomExists(roomId);

        RoomRuntime storage rt = roomRuntime[roomId];
        require(msg.sender == rt.creator, "only creator can start");
        require(rt.state == RoomState.Open, "room not open");
        require(rt.playerCount >= 2, "not enough players");

        rt.state = RoomState.Started;
        emit RoomStarted(roomId, msg.sender);
    }

    /// @notice Record a player action for this room (fold / check / call / bet / raise).
    /// @dev This function *does not* move ETH. The amount is for on-chain logging only.
    function recordAction(
        uint256 roomId,
        ActionType actionType,
        uint256 amount
    ) external {
        _roomExists(roomId);

        RoomRuntime storage rt = roomRuntime[roomId];
        require(rt.state == RoomState.Started, "room not started");
        require(hasJoined[roomId][msg.sender], "not a player");
        require(!hasFolded[roomId][msg.sender], "already folded");

        if (actionType == ActionType.Fold) {
            // Fold: mark folded and always store amount = 0
            hasFolded[roomId][msg.sender] = true;
            amount = 0;
        } else if (actionType == ActionType.Check) {
            // Check: must not change chips, so amount must be 0
            require(amount == 0, "amount must be 0 for check");
        } else {
            // Call / Bet / Raise: require a positive amount
            require(amount > 0, "amount must be > 0 for this action");
        }

        roomActions[roomId].push(
            Action({
                player: msg.sender,
                actionType: actionType,
                amount: amount,
                timestamp: block.timestamp
            })
        );

        emit ActionRecorded(roomId, msg.sender, actionType, amount, block.timestamp);
    }

    /// @notice Vote for a winner after the offline round is finished.
    /// @dev Only joined players can vote; folded players may still vote,
    ///      but cannot be selected as winner. Each address votes at most once.
    function voteWinner(uint256 roomId, address candidate) external {
        _roomExists(roomId);

        RoomRuntime storage rt = roomRuntime[roomId];
        require(rt.state == RoomState.Started, "room not started");
        require(hasJoined[roomId][msg.sender], "not a player");
        // folded players are allowed to vote (social consensus), so no hasFolded check here
        require(hasJoined[roomId][candidate], "candidate not in room");
        require(!hasFolded[roomId][candidate], "candidate folded");
        require(!hasVoted[roomId][msg.sender], "already voted");

        hasVoted[roomId][msg.sender] = true;
        voteCount[roomId][candidate] += 1;

        emit WinnerVoted(roomId, msg.sender, candidate);
    }

    /// @notice Finalize the room and pay the winner. Only the creator can call this.
    /// @dev Requires strict majority among active players (joined and not folded).
    function finalize(uint256 roomId, address candidate) external {
        _roomExists(roomId);

        RoomRuntime storage rt = roomRuntime[roomId];
        require(msg.sender == rt.creator, "only creator can finalize");
        require(rt.state == RoomState.Started, "room not in started state");
        require(hasJoined[roomId][candidate], "candidate not in room");
        require(!hasFolded[roomId][candidate], "candidate folded");

        uint256 activePlayers = _countActivePlayers(roomId);
        require(activePlayers > 0, "no active players");

        uint256 votes = voteCount[roomId][candidate];
        // strict majority: votes > activePlayers / 2
        require(votes * 2 > activePlayers, "no majority for candidate");

        rt.state = RoomState.Settled;
        rt.winner = candidate;

        uint256 payout = rt.totalPool;
        rt.totalPool = 0;

        (bool sent, ) = payable(candidate).call{value: payout}("");
        require(sent, "failed to send payout");

        _updateReputationAfterFinalize(roomId, candidate);

        emit RoomFinalized(roomId, candidate, payout, block.timestamp);
    }
}

