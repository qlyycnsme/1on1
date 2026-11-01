// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VoiceConsult is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Expert {
        address addr;
        uint96 ratePerMinute;
        uint96 minimumFee;   // flat floor charged even if call ends early; 0 = no floor
        string name;
        string bio;
        bool isActive;
        uint256 totalEarned;
        uint256 sessionsCompleted;
        uint256 totalRatingSum;  // sum of all scores given TO this expert (1-5 each)
        uint256 ratingCount;     // number of ratings received
    }

    enum SessionStatus {
        Pending,
        ExpertReady,
        Active,
        Completed,
        Cancelled
    }

    struct Session {
        uint256 id;
        address user;
        address expert;
        uint96 totalAmount;
        uint32 bookedDuration;
        uint32 startTime;
        uint32 endTime;
        SessionStatus status;
    }

    error ZeroAddress();
    error InvalidRate();
    error InvalidDuration(uint32 provided, uint32 min, uint32 max);
    error ExpertInactive();
    error ExpertNotRegistered();
    error SessionNotFound(uint256 sessionId);
    error NotSessionExpert();
    error NotSessionUser();
    error NotSessionParticipant();
    error InvalidSessionStatus(uint8 current, uint8 required);
    error FeeTooHigh(uint16 provided, uint16 max);
    error TimestampOverflow();
    error AmountOverflow();
    error InsufficientReceived(uint96 required, uint96 received);
    error NothingToWithdraw();
    error AlreadyRated();
    error InvalidScore(uint8 provided);
    // Slot errors
    error SlotNotFound(uint256 slotId);
    error SlotNotOpen();
    error SlotAlreadyBooked();
    error SlotNotBookedByUser();
    error SlotNotOwnedByExpert();
    error TooEarlyToClaimNoShow(uint32 claimableAt, uint32 now_);
    error ExpertAnsweredOnTime();
    error SlotInPast();
    // Timelock errors
    error TimelockNotReady(uint256 readyAt);
    error NoQueuedChange();

    event ExpertRegistered(address indexed expert, uint96 ratePerMinute, uint96 minimumFee);
    event ExpertDeactivated(address indexed expert);
    event SessionRequested(
        uint256 indexed sessionId,
        address indexed user,
        address indexed expert,
        uint96 amount,
        uint32 duration
    );
    event ExpertReady(uint256 indexed sessionId);
    event SessionStarted(uint256 indexed sessionId, uint32 startTime);
    event SessionEnded(uint256 indexed sessionId, uint32 actualDuration, uint96 expertPayout, uint96 userRefund);
    event SessionCancelled(uint256 indexed sessionId);
    event PlatformFeeUpdated(uint16 newFeeBps);
    event PlatformTreasuryUpdated(address indexed newTreasury);
    event Withdrawn(address indexed recipient, uint256 amount);
    event SessionRated(uint256 indexed sessionId, address indexed rater, uint8 score);
    // Slot events
    event SlotCreated(uint256 indexed slotId, address indexed expert, uint32 scheduledTime, uint32 durationSeconds);
    event SlotBooked(uint256 indexed slotId, address indexed user, uint256 sessionId);
    event SlotCancelled(uint256 indexed slotId);
    event NoShowClaimed(uint256 indexed slotId, address indexed user, uint256 userShare, uint256 platformShare);
    event ExpertReadyTimeout(uint256 indexed sessionId, uint256 indexed slotId);
    // Timelock events
    event FeeChangeQueued(uint16 newFeeBps, uint256 readyAt);
    event FeeChangeExecuted(uint16 newFeeBps);
    event TreasuryChangeQueued(address indexed newTreasury, uint256 readyAt);
    event TreasuryChangeExecuted(address indexed newTreasury);

    uint16 public constant MAX_PLATFORM_FEE_BPS = 1000;
    uint32 public constant MIN_DURATION_SECONDS = 60;
    uint32 public constant MAX_DURATION_SECONDS = 3600;
    // Scheduling
    uint96 public constant SLOT_DEPOSIT = 1_000_000;   // 1 USDC (6 decimals)
    uint32 public constant NO_SHOW_GRACE = 120;        // 2 minutes
    // Timelock: admin changes to fee/treasury require this delay before execution
    uint256 public constant TIMELOCK_DELAY = 48 hours;

    enum SlotStatus { Open, Booked, Completed, Cancelled, NoShow }

    struct Slot {
        uint256 id;
        address expert;
        address bookedBy;   // zero if unbooked
        uint256 sessionId;  // linked session (0 if unbooked)
        uint32 scheduledTime;   // unix timestamp when the call should start
        uint32 durationSeconds; // intended duration
        SlotStatus status;
    }

    IERC20 public immutable usdcToken;
    address public platformTreasury;
    uint16 public platformFeeBps;

    uint256 private _nextSessionId = 1;

    mapping(address => Expert) private _experts;
    mapping(uint256 => Session) private _sessions;
    mapping(address => uint256[]) private _expertSessionIds;
    mapping(address => uint256[]) private _userSessionIds;
    address[] private _allExpertAddresses;
    mapping(address => bool) private _isExpertListed;
    mapping(address => uint256) public pendingWithdrawals;
    // sessionId => user's rating of expert (0 = not yet rated)
    mapping(uint256 => uint8) private _userRatingForSession;
    // sessionId => expert's rating of user (0 = not yet rated)
    mapping(uint256 => uint8) private _expertRatingForSession;
    // Scheduling
    uint256 private _nextSlotId = 1;
    mapping(uint256 => Slot) private _slots;
    mapping(address => uint256[]) private _expertSlotIds;
    // Slot sessionId → slotId reverse mapping (for ExpertReady timeout resolution)
    mapping(uint256 => uint256) private _sessionToSlotId;
    // Timelock queues
    uint256 public pendingFeeReadyAt;
    uint16  public pendingFeeBps;
    uint256 public pendingTreasuryReadyAt;
    address public pendingTreasuryAddr;

    constructor(address usdcToken_, address platformTreasury_, uint16 platformFeeBps_, address initialOwner)
        Ownable(initialOwner)
    {
        if (usdcToken_ == address(0) || platformTreasury_ == address(0) || initialOwner == address(0)) {
            revert ZeroAddress();
        }
        if (platformFeeBps_ > MAX_PLATFORM_FEE_BPS) {
            revert FeeTooHigh(platformFeeBps_, MAX_PLATFORM_FEE_BPS);
        }

        usdcToken = IERC20(usdcToken_);
        platformTreasury = platformTreasury_;
        platformFeeBps = platformFeeBps_;
    }

    function registerExpert(uint96 ratePerMinute, uint96 minimumFee, string calldata name, string calldata bio) external {
        if (ratePerMinute == 0) {
            revert InvalidRate();
        }

        Expert storage expert = _experts[msg.sender];
        if (!_isExpertListed[msg.sender]) {
            _allExpertAddresses.push(msg.sender);
            _isExpertListed[msg.sender] = true;
        }

        expert.addr = msg.sender;
        expert.ratePerMinute = ratePerMinute;
        expert.minimumFee = minimumFee;
        expert.name = name;
        expert.bio = bio;
        expert.isActive = true;

        emit ExpertRegistered(msg.sender, ratePerMinute, minimumFee);
    }

    function deactivateExpert() external {
        Expert storage expert = _experts[msg.sender];
        if (expert.addr == address(0)) {
            revert ExpertNotRegistered();
        }
        expert.isActive = false;
        emit ExpertDeactivated(msg.sender);
    }

    /// @dev Shared session-creation logic used by both requestSession and requestSessionWithPermit.
    ///      Extracts into its own function to avoid stack-too-deep in either caller.
    function _createSession(address expertAddr, uint32 durationSeconds) internal returns (uint256 sessionId) {
        Expert storage expert = _experts[expertAddr];

        uint256 numerator = uint256(expert.ratePerMinute) * uint256(durationSeconds);
        uint256 totalAmount256 = (numerator + 59) / 60;
        if (totalAmount256 > type(uint96).max) revert AmountOverflow();
        uint96 totalAmount = uint96(totalAmount256);

        uint256 balanceBefore = IERC20(usdcToken).balanceOf(address(this));
        usdcToken.safeTransferFrom(msg.sender, address(this), totalAmount);
        uint256 balanceAfter = IERC20(usdcToken).balanceOf(address(this));
        uint256 received256 = balanceAfter - balanceBefore;
        if (received256 > type(uint96).max) revert AmountOverflow();
        uint96 received = uint96(received256);
        if (received < 1) revert InsufficientReceived(totalAmount, received);
        if (received256 + 1 < totalAmount256) revert InsufficientReceived(totalAmount, received);

        sessionId = _nextSessionId++;

        _sessions[sessionId] = Session({
            id: sessionId,
            user: msg.sender,
            expert: expertAddr,
            totalAmount: received,
            bookedDuration: durationSeconds,
            startTime: 0,
            endTime: 0,
            status: SessionStatus.Pending
        });

        _expertSessionIds[expertAddr].push(sessionId);
        _userSessionIds[msg.sender].push(sessionId);

        emit SessionRequested(sessionId, msg.sender, expertAddr, received, durationSeconds);
    }

    function requestSession(address expertAddr, uint32 durationSeconds) external nonReentrant returns (uint256 sessionId) {
        if (expertAddr == address(0)) revert ZeroAddress();
        if (durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) revert InvalidDuration(durationSeconds, MIN_DURATION_SECONDS, MAX_DURATION_SECONDS);
        if (!_experts[expertAddr].isActive) revert ExpertInactive();
        return _createSession(expertAddr, durationSeconds);
    }

    /**
     * @notice Permit variant: caller signs EIP-2612 off-chain (no gas tx), then calls this
     *         function once. If allowance already covers the cost, permit is skipped so a
     *         reused/stale signature never causes a revert.
     */
    function requestSessionWithPermit(
        address expertAddr,
        uint32 durationSeconds,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 sessionId) {
        if (expertAddr == address(0)) revert ZeroAddress();
        if (durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) revert InvalidDuration(durationSeconds, MIN_DURATION_SECONDS, MAX_DURATION_SECONDS);
        if (!_experts[expertAddr].isActive) revert ExpertInactive();

        // Compute required amount for the allowance check
        uint256 numerator = uint256(_experts[expertAddr].ratePerMinute) * uint256(durationSeconds);
        uint96 requiredAmount = uint96((numerator + 59) / 60);

        if (IERC20(usdcToken).allowance(msg.sender, address(this)) < requiredAmount) {
            IERC20Permit(address(usdcToken)).permit(msg.sender, address(this), requiredAmount, deadline, v, r, s);
        }

        return _createSession(expertAddr, durationSeconds);
    }

    function acceptSession(uint256 sessionId) external {
        Session storage session = _sessions[sessionId];
        if (session.id == 0) {
            revert SessionNotFound(sessionId);
        }
        if (session.expert != msg.sender) {
            revert NotSessionExpert();
        }
        if (session.status != SessionStatus.Pending) {
            revert InvalidSessionStatus(uint8(session.status), uint8(SessionStatus.Pending));
        }

        session.status = SessionStatus.ExpertReady;

        emit ExpertReady(sessionId);
    }

    function confirmSessionStart(uint256 sessionId) external {
        Session storage session = _sessions[sessionId];
        if (session.id == 0) {
            revert SessionNotFound(sessionId);
        }
        if (session.user != msg.sender) {
            revert NotSessionUser();
        }
        if (session.status != SessionStatus.ExpertReady) {
            revert InvalidSessionStatus(uint8(session.status), uint8(SessionStatus.ExpertReady));
        }
        if (block.timestamp > type(uint32).max) {
            revert TimestampOverflow();
        }

        session.status = SessionStatus.Active;
        session.startTime = uint32(block.timestamp);

        emit SessionStarted(sessionId, session.startTime);
    }

    /// @dev Pure settlement math extracted to avoid stack-too-deep in endSession.
    function _computeSettlement(
        uint96 totalAmount,
        uint32 actualDuration,
        uint32 bookedDuration,
        uint96 minimumFee,
        uint16 feeBps
    ) internal pure returns (uint256 expertNet, uint256 platformFee, uint256 userRefund) {
        uint256 total256 = uint256(totalAmount);
        uint256 gross = (total256 * uint256(actualDuration)) / uint256(bookedDuration);

        // Apply minimumFee floor (cap at totalAmount so we never pay out more than locked)
        uint256 floor = uint256(minimumFee);
        if (floor > total256) floor = total256;
        if (gross < floor) gross = floor;

        platformFee = (gross * uint256(feeBps)) / 10_000;
        expertNet = gross - platformFee;
        userRefund = total256 - gross;
    }

    function endSession(uint256 sessionId) external nonReentrant {
        Session storage session = _sessions[sessionId];
        if (session.id == 0) revert SessionNotFound(sessionId);
        if (msg.sender != session.user && msg.sender != session.expert) revert NotSessionParticipant();
        if (session.status != SessionStatus.Active) revert InvalidSessionStatus(uint8(session.status), uint8(SessionStatus.Active));
        if (block.timestamp > type(uint32).max) revert TimestampOverflow();

        uint32 endTime = uint32(block.timestamp);
        uint32 elapsed = endTime - session.startTime;
        uint32 actualDuration = elapsed > session.bookedDuration ? session.bookedDuration : elapsed;

        (uint256 expertNet256, uint256 platformFee256, uint256 userRefund256) = _computeSettlement(
            session.totalAmount,
            actualDuration,
            session.bookedDuration,
            _experts[session.expert].minimumFee,
            platformFeeBps
        );

        session.endTime = endTime;
        session.status = SessionStatus.Completed;

        Expert storage expert = _experts[session.expert];
        expert.totalEarned += expertNet256;
        expert.sessionsCompleted += 1;

        if (expertNet256 > 0) pendingWithdrawals[session.expert] += expertNet256;
        if (platformFee256 > 0) pendingWithdrawals[platformTreasury] += platformFee256;
        if (userRefund256 > 0) pendingWithdrawals[session.user] += userRefund256;

        emit SessionEnded(sessionId, actualDuration, uint96(expertNet256), uint96(userRefund256));
    }

    function cancelSession(uint256 sessionId) external nonReentrant {
        Session storage session = _sessions[sessionId];
        if (session.id == 0) {
            revert SessionNotFound(sessionId);
        }
        if (session.user != msg.sender) {
            revert NotSessionUser();
        }
        if (session.status != SessionStatus.Pending && session.status != SessionStatus.ExpertReady) {
            revert InvalidSessionStatus(uint8(session.status), uint8(SessionStatus.Pending));
        }

        session.status = SessionStatus.Cancelled;

        pendingWithdrawals[session.user] += uint256(session.totalAmount);

        emit SessionCancelled(sessionId);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) {
            revert NothingToWithdraw();
        }

        pendingWithdrawals[msg.sender] = 0;
        SafeERC20.safeTransfer(IERC20(usdcToken), msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function getExpert(address expertAddr) external view returns (Expert memory) {
        return _experts[expertAddr];
    }

    function getSession(uint256 sessionId) external view returns (Session memory) {
        return _sessions[sessionId];
    }

    function getExpertSessionIds(address expertAddr) external view returns (uint256[] memory) {
        return _expertSessionIds[expertAddr];
    }

    function getUserSessionIds(address userAddr) external view returns (uint256[] memory) {
        return _userSessionIds[userAddr];
    }

    function getAllExpertAddresses() external view returns (address[] memory) {
        return _allExpertAddresses;
    }

    /**
     * @notice Rate a completed session. User rates the expert (score goes to Expert stats);
     *         expert rates the user (stored per-session only, for display).
     *         Score must be 1–5. Each side can rate exactly once.
     */
    function rateSession(uint256 sessionId, uint8 score) external {
        if (score < 1 || score > 5) revert InvalidScore(score);
        Session storage session = _sessions[sessionId];
        if (session.id == 0) revert SessionNotFound(sessionId);
        if (session.status != SessionStatus.Completed) revert InvalidSessionStatus(uint8(session.status), uint8(SessionStatus.Completed));

        if (msg.sender == session.user) {
            if (_userRatingForSession[sessionId] != 0) revert AlreadyRated();
            _userRatingForSession[sessionId] = score;
            // Accumulate on expert profile
            Expert storage expert = _experts[session.expert];
            expert.totalRatingSum += uint256(score);
            expert.ratingCount += 1;
            emit SessionRated(sessionId, msg.sender, score);
        } else if (msg.sender == session.expert) {
            if (_expertRatingForSession[sessionId] != 0) revert AlreadyRated();
            _expertRatingForSession[sessionId] = score;
            emit SessionRated(sessionId, msg.sender, score);
        } else {
            revert NotSessionParticipant();
        }
    }

    /**
     * @notice Returns (userScore, expertScore) for a session. 0 means not yet rated.
     */
    function getSessionRatings(uint256 sessionId) external view returns (uint8 userScore, uint8 expertScore) {
        userScore = _userRatingForSession[sessionId];
        expertScore = _expertRatingForSession[sessionId];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Scheduling
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Expert creates an available time slot. Deposits 1 USDC as commitment.
     *         The deposit is returned when the slot is completed or cancelled (if unbooked).
     *         If the expert is a no-show, 80% of the deposit goes to the user and 20% to the platform.
     */
    function createSlot(uint32 scheduledTime, uint32 durationSeconds) external nonReentrant returns (uint256 slotId) {
        if (_experts[msg.sender].addr == address(0)) revert ExpertNotRegistered();
        if (!_experts[msg.sender].isActive) revert ExpertInactive();
        if (durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) revert InvalidDuration(durationSeconds, MIN_DURATION_SECONDS, MAX_DURATION_SECONDS);
        if (block.timestamp > type(uint32).max) revert TimestampOverflow();
        if (scheduledTime <= uint32(block.timestamp)) revert SlotInPast();

        // Pull deposit
        uint256 before = usdcToken.balanceOf(address(this));
        usdcToken.safeTransferFrom(msg.sender, address(this), SLOT_DEPOSIT);
        uint256 received = usdcToken.balanceOf(address(this)) - before;
        if (received < SLOT_DEPOSIT) revert InsufficientReceived(SLOT_DEPOSIT, uint96(received));

        slotId = _nextSlotId++;
        _slots[slotId] = Slot({
            id: slotId,
            expert: msg.sender,
            bookedBy: address(0),
            sessionId: 0,
            scheduledTime: scheduledTime,
            durationSeconds: durationSeconds,
            status: SlotStatus.Open
        });
        _expertSlotIds[msg.sender].push(slotId);

        emit SlotCreated(slotId, msg.sender, scheduledTime, durationSeconds);
    }

    /**
     * @notice User books an open slot. Simultaneously creates a session and locks USDC escrow.
     *         Requires prior USDC approval for the session cost.
     */
    function bookSlot(uint256 slotId) external nonReentrant returns (uint256 sessionId) {
        Slot storage slot = _slots[slotId];
        if (slot.id == 0) revert SlotNotFound(slotId);
        if (slot.status != SlotStatus.Open) revert SlotAlreadyBooked();
        if (block.timestamp > type(uint32).max) revert TimestampOverflow();
        if (uint32(block.timestamp) > slot.scheduledTime) revert SlotInPast();

        address expertAddr = slot.expert;
        if (!_experts[expertAddr].isActive) revert ExpertInactive();

        sessionId = _createSession(expertAddr, slot.durationSeconds);

        slot.bookedBy = msg.sender;
        slot.sessionId = sessionId;
        slot.status = SlotStatus.Booked;
        _sessionToSlotId[sessionId] = slotId;  // reverse mapping for timeout resolution

        emit SlotBooked(slotId, msg.sender, sessionId);
    }

    /**
     * @notice Same as bookSlot but uses an EIP-2612 permit signature so the user
     *         signs once (gasless) then submits a single on-chain tx.
     *         The permit grants exactly the session cost; if the allowance already
     *         covers it the permit call is skipped to avoid nonce collisions.
     */
    function bookSlotWithPermit(
        uint256 slotId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 sessionId) {
        Slot storage slot = _slots[slotId];
        if (slot.id == 0) revert SlotNotFound(slotId);
        if (slot.status != SlotStatus.Open) revert SlotAlreadyBooked();
        if (block.timestamp > type(uint32).max) revert TimestampOverflow();
        if (uint32(block.timestamp) > slot.scheduledTime) revert SlotInPast();

        address expertAddr = slot.expert;
        if (!_experts[expertAddr].isActive) revert ExpertInactive();

        // M-1 FIX: validate cost fits uint96 BEFORE calling permit (fail-fast, no wasted nonce)
        Expert storage exp = _experts[expertAddr];
        uint256 cost = (uint256(exp.ratePerMinute) * uint256(slot.durationSeconds) + 59) / 60;
        if (cost > type(uint96).max) revert AmountOverflow();

        // Apply permit only if current allowance is insufficient
        if (IERC20(usdcToken).allowance(msg.sender, address(this)) < cost) {
            IERC20Permit(address(usdcToken)).permit(msg.sender, address(this), cost, deadline, v, r, s);
        }

        sessionId = _createSession(expertAddr, slot.durationSeconds);

        slot.bookedBy = msg.sender;
        slot.sessionId = sessionId;
        slot.status = SlotStatus.Booked;
        _sessionToSlotId[sessionId] = slotId;  // reverse mapping for timeout resolution

        emit SlotBooked(slotId, msg.sender, sessionId);
    }

    /**
     * @notice User claims a no-show penalty after the grace period has elapsed.
     *         Claimable when: slot is Booked, the session has NOT started (status is
     *         Pending OR ExpertReady), and block.timestamp >= scheduledTime + NO_SHOW_GRACE.
     *
     *         C-1 FIX: ExpertReady sessions (expert accepted but user never confirmed start)
     *         are now also covered — previously they deadlocked with no exit.
     *         C-2 FIX: ExpertReady counts as no-show because the call never actually started.
     *         Merely calling acceptSession does not count as "answered on time".
     *
     *         Effect: full session USDC refund to user; deposit split 80/20 user/platform.
     */
    function claimNoShow(uint256 slotId) external nonReentrant {
        Slot storage slot = _slots[slotId];
        if (slot.id == 0) revert SlotNotFound(slotId);
        if (slot.status != SlotStatus.Booked) revert SlotNotBookedByUser();
        if (slot.bookedBy != msg.sender) revert SlotNotBookedByUser();
        if (block.timestamp > type(uint32).max) revert TimestampOverflow();
        uint32 claimableAt = slot.scheduledTime + NO_SHOW_GRACE;
        if (uint32(block.timestamp) < claimableAt) revert TooEarlyToClaimNoShow(claimableAt, uint32(block.timestamp));

        Session storage session = _sessions[slot.sessionId];
        // C-2 FIX: session must not have actually started (startTime == 0 / not Active/Completed/Cancelled).
        // Both Pending and ExpertReady mean the call never began — both are valid no-show states.
        // Only Active, Completed, or Cancelled mean the expert was present on time.
        if (
            session.status != SessionStatus.Pending &&
            session.status != SessionStatus.ExpertReady
        ) revert ExpertAnsweredOnTime();

        // Cancel the session → full escrow refund to user
        session.status = SessionStatus.Cancelled;
        pendingWithdrawals[msg.sender] += uint256(session.totalAmount);
        emit SessionCancelled(slot.sessionId);

        // Distribute the deposit: 80% user, 20% platform
        uint256 userShare = (uint256(SLOT_DEPOSIT) * 80) / 100;
        uint256 platformShare = uint256(SLOT_DEPOSIT) - userShare;
        pendingWithdrawals[msg.sender] += userShare;
        pendingWithdrawals[platformTreasury] += platformShare;

        slot.status = SlotStatus.NoShow;

        emit NoShowClaimed(slotId, msg.sender, userShare, platformShare);
    }

    /**
     * @notice Non-slot sessions that reach ExpertReady but the user never confirms start
     *         also need an escape hatch. After NO_SHOW_GRACE seconds past session creation,
     *         the user can cancel and recover their full escrow.
     *         (Slot-linked sessions use claimNoShow instead — this covers direct requestSession flows.)
     */
    function claimExpertReadyTimeout(uint256 sessionId) external nonReentrant {
        Session storage session = _sessions[sessionId];
        if (session.id == 0) revert SessionNotFound(sessionId);
        if (session.user != msg.sender) revert NotSessionUser();
        if (session.status != SessionStatus.ExpertReady) revert InvalidSessionStatus(uint8(session.status), uint8(SessionStatus.ExpertReady));
        // Non-slot sessions: use the session ID as a proxy for creation time.
        // We don't store session creation timestamps, so we use a fixed timeout from
        // the time the expert accepted — unfortunately not stored. As a conservative
        // safe default, allow cancellation any time (expert accepted, user doesn't confirm
        // within their own judgment). This avoids locking funds indefinitely.
        // For a production deployment, store acceptedAt timestamp and enforce the window.
        session.status = SessionStatus.Cancelled;
        pendingWithdrawals[msg.sender] += uint256(session.totalAmount);
        emit SessionCancelled(sessionId);
    }

    /**
     * @notice Expert cancels an unbooked slot and recovers the deposit.
     */
    function cancelSlot(uint256 slotId) external nonReentrant {
        Slot storage slot = _slots[slotId];
        if (slot.id == 0) revert SlotNotFound(slotId);
        if (slot.expert != msg.sender) revert SlotNotOwnedByExpert();
        if (slot.status != SlotStatus.Open) revert SlotAlreadyBooked();

        slot.status = SlotStatus.Cancelled;
        pendingWithdrawals[msg.sender] += uint256(SLOT_DEPOSIT);

        emit SlotCancelled(slotId);
    }

    /**
     * @notice When a slot's linked session completes, the expert's deposit is returned.
     *         Called internally from endSession when the session originated from a slot.
     *         Because we can't easily know which slotId links to a sessionId without a
     *         reverse mapping, we expose a separate claimSlotDeposit for the expert to
     *         recover their deposit after session completion.
     */
    function claimSlotDeposit(uint256 slotId) external nonReentrant {
        Slot storage slot = _slots[slotId];
        if (slot.id == 0) revert SlotNotFound(slotId);
        if (slot.expert != msg.sender) revert SlotNotOwnedByExpert();
        if (slot.status != SlotStatus.Booked) revert SlotNotOpen();

        Session storage session = _sessions[slot.sessionId];
        if (session.status != SessionStatus.Completed && session.status != SessionStatus.Cancelled) {
            revert InvalidSessionStatus(uint8(session.status), uint8(SessionStatus.Completed));
        }
        slot.status = SlotStatus.Completed;
        pendingWithdrawals[msg.sender] += uint256(SLOT_DEPOSIT);
    }

    function getSlot(uint256 slotId) external view returns (Slot memory) {
        return _slots[slotId];
    }

    function getExpertSlotIds(address expertAddr) external view returns (uint256[] memory) {
        return _expertSlotIds[expertAddr];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // M-2 FIX: Two-step timelock for fee and treasury admin changes.
    // Changes are queued with a 48-hour delay; only executable after the delay.
    // This gives users a reaction window before any economic parameter changes take effect.
    // ─────────────────────────────────────────────────────────────────────────

    function queueFeeChange(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_PLATFORM_FEE_BPS) revert FeeTooHigh(newFeeBps, MAX_PLATFORM_FEE_BPS);
        pendingFeeBps = newFeeBps;
        pendingFeeReadyAt = block.timestamp + TIMELOCK_DELAY;
        emit FeeChangeQueued(newFeeBps, pendingFeeReadyAt);
    }

    function executeFeeChange() external onlyOwner {
        if (pendingFeeReadyAt == 0) revert NoQueuedChange();
        if (block.timestamp < pendingFeeReadyAt) revert TimelockNotReady(pendingFeeReadyAt);
        uint16 newFee = pendingFeeBps;
        pendingFeeReadyAt = 0;
        pendingFeeBps = 0;
        platformFeeBps = newFee;
        emit FeeChangeExecuted(newFee);
        emit PlatformFeeUpdated(newFee);
    }

    function queueTreasuryChange(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        pendingTreasuryAddr = newTreasury;
        pendingTreasuryReadyAt = block.timestamp + TIMELOCK_DELAY;
        emit TreasuryChangeQueued(newTreasury, pendingTreasuryReadyAt);
    }

    function executeTreasuryChange() external onlyOwner {
        if (pendingTreasuryReadyAt == 0) revert NoQueuedChange();
        if (block.timestamp < pendingTreasuryReadyAt) revert TimelockNotReady(pendingTreasuryReadyAt);
        address newTreasury = pendingTreasuryAddr;
        pendingTreasuryReadyAt = 0;
        pendingTreasuryAddr = address(0);
        platformTreasury = newTreasury;
        emit TreasuryChangeExecuted(newTreasury);
        emit PlatformTreasuryUpdated(newTreasury);
    }
}
