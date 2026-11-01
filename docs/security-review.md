# VoiceConsult Smart Contract Security Review

**Contract:** `VoiceConsult.sol`  
**Latest deployment:** `0x74682111c988e780dc2ebbb144ba14235ea3ccc2` (Arc Testnet)  
**Review date:** 2026-11-01  
**Severity levels audited:** max (Critical + High + Medium + Low + Info)

---

## Summary

| Severity | Count | Status |
|---|---|---|
| Critical | 2 | Open — fixes proposed below |
| Medium | 2 | Open — fixes proposed below |
| Low | 1 | Open — minor, fix proposed below |

No High findings. All previously reported findings (fee-on-transfer accounting, arc-blocklist push-payment, unilateral billing start, permit domain mismatch) were fixed in earlier rounds.

---

## Critical Findings

### C-1 · ExpertReady Deadlock — Slot Sessions Can Be Permanently Locked

**Location:** `acceptSession`, `claimNoShow`, `endSession`, `claimSlotDeposit`

**What happens:**

1. User books a slot → session created in `Pending` state
2. Expert calls `acceptSession` → status moves to `ExpertReady`
3. User never calls `confirmSessionStart` (goes offline, changes mind, connectivity issue)
4. `claimNoShow` is blocked: requires `Pending`, but status is now `ExpertReady`
5. `endSession` is blocked: requires `Active`
6. `claimSlotDeposit` is blocked: requires linked session `Completed` or `Cancelled`
7. **Result:** user's session USDC and expert's 1 USDC slot deposit are locked permanently with no exit path

**Attack variant:** Expert accepts every request immediately (zero cost) to grief users who try to cancel-and-rebook, trapping their USDC until they call `confirmSessionStart`.

**Proposed fix:** Treat `ExpertReady` status as no-show-eligible after `scheduledTime + NO_SHOW_GRACE`. Allow `claimNoShow` when `status == Pending OR ExpertReady` AND `startTime == 0` AND `block.timestamp >= scheduledTime + NO_SHOW_GRACE`. Also allow the user to cancel (full refund) from `ExpertReady` if `startTime == 0` after a timeout.

---

### C-2 · No-Show Penalty Bypass via Last-Minute Accept

**Location:** `claimNoShow`, `acceptSession`

**What happens:**

1. Expert creates a slot, user books it
2. Scheduled time arrives; expert has no intention of calling but wants to avoid the 80/20 penalty
3. Expert calls `acceptSession` 1 second before grace period expires → status = `ExpertReady`
4. `claimNoShow` checks `session.status == Pending` → **reverts** because status is `ExpertReady`
5. Expert keeps their 1 USDC deposit, user gets no compensation, escrow is deadlocked (see C-1)

A single `acceptSession` transaction (negligible gas cost) completely nullifies the no-show mechanism.

**Proposed fix:** No-show eligibility must be based on whether the session *actually started* (`startTime == 0`), not whether the expert acknowledged it. Change the `claimNoShow` guard to:
```solidity
if (session.status != SessionStatus.Pending && session.status != SessionStatus.ExpertReady) revert ExpertAnsweredOnTime();
if (session.startTime != 0) revert ExpertAnsweredOnTime(); // call actually started
```
Additionally, extend `cancelSession` to allow user cancellation from `ExpertReady` after `scheduledTime + NO_SHOW_GRACE` with the same 80/20 deposit split.

---

## Medium Findings

### M-1 · Permit Called Before Validation in `bookSlotWithPermit`

**Location:** `bookSlotWithPermit` line ~522

**What happens:** The function calls `IERC20Permit.permit(...)` before `_createSession` validates the computed cost fits in a `uint96`. If an expert sets `ratePerMinute` so high that `cost > type(uint96).max`, the permit side effect (nonce consumed, allowance set) executes, then `_createSession` reverts. The user has wasted a permit nonce and must re-sign for every retry.

**Proposed fix:** Pre-validate `cost <= type(uint96).max` before calling `permit`:
```solidity
if (cost > type(uint96).max) revert InvalidRate();
if (IERC20(usdcToken).allowance(msg.sender, address(this)) < cost) {
    IERC20Permit(address(usdcToken)).permit(...);
}
```
`requestSessionWithPermit` has the same pattern and should get the same fix.

---

### M-2 · No Timelock on Fee and Treasury Changes

**Location:** `updatePlatformFee`, `updatePlatformTreasury`

**What happens:** The owner can change the platform fee (up to 10%) and treasury address in a single transaction with immediate effect. Users who have funds locked in open sessions cannot react before the new parameters apply to their settlement.

**Risk:** Compromised owner key → fee raised to 10% + treasury changed → all pending settlements drained.

**Proposed fix (production hardening):** Add a two-step queued-change pattern with a minimum 48-hour delay. For testnet/demo, at minimum emit an event and document the risk. For a production deployment, consider transferring ownership to a multisig or governance contract.

---

## Low Findings

### L-1 · Custom Errors Lack Context Parameters

**Location:** Multiple errors (`InvalidDuration`, `InvalidSessionStatus`, `SlotAlreadyBooked`, etc.)

**What happens:** Errors omit the provided value and expected range, making on-chain debugging and monitoring harder. Example: `InvalidDuration()` could be `InvalidDuration(uint32 provided, uint32 min, uint32 max)`.

**Proposed fix:** Add relevant parameters to non-trivial errors. Low priority for testnet; important before mainnet deployment.

---

## Previously Fixed Findings (for record)

| Finding | Round Fixed |
|---|---|
| Fee-on-transfer token deposit accounting (High) | Round 1 |
| Arc blocklist bricks settlement — push → pull payments (Critical) | Round 1 |
| Unilateral expert billing start (High) | Round 2 |
| EIP-2612 domain name mismatch `'USD Coin'` vs `'USDC'` (High) | Round 3 |

---

## Recommended Action Priority

1. **Fix C-1 + C-2 together** (one contract change handles both): extend `claimNoShow` to cover `ExpertReady` state, and extend `cancelSession` to allow user timeout-cancel from `ExpertReady`.
2. **Fix M-1**: pre-validate cost bounds before `permit` calls (both `bookSlotWithPermit` and `requestSessionWithPermit`).
3. **M-2**: accept as known risk for testnet; add timelock before any mainnet deployment.
4. **L-1**: add error parameters incrementally; not blocking.

---

*This review was performed by Arc Studio's automated audit system. It is not a substitute for a professional third-party security audit before mainnet deployment.*
