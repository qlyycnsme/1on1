# VoiceConsult — 一对一语音付费咨询 DApp

> Built with Arc Studio - money-powered apps in minutes

## What This App Does

Decentralized one-to-one paid voice consultation platform on Arc Testnet. Any wallet can register as an expert with a per-minute USDC rate and optional minimum fee (起步价). Users browse the expert marketplace, pre-pay USDC (locked in escrow), and start a real-time P2P voice call via WebRTC. When either party ends the call, the smart contract releases USDC proportionally based on actual call duration vs booked duration (subject to the expert's minimum fee floor). Pull-based withdrawal prevents stuck funds if any recipient is blocklisted.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, Arc Light design
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry + OpenZeppelin 5.1.0. Sources in `contracts/`, build with `bun run contracts:build`.
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC (6 decimals) at 0x3600000000000000000000000000000000000000
- Voice: WebRTC P2P (browser-native getUserMedia + RTCPeerConnection)
- Toasts: Sonner
- Fonts: Space Grotesk (display), DM Sans (body), JetBrains Mono (mono)

## Contract Deployments

| Contract | Chain | Address | Explorer |
|---|---|---|---|
| VoiceConsult (v1) | Arc Testnet | 0x06a7509d309ffd2302da6b751bcb56ee5fe49f34 | https://explorer.testnet.arc.io/address/0x06a7509d309ffd2302da6b751bcb56ee5fe49f34 |
| VoiceConsult (v2, +minimumFee) | Arc Testnet | 0xb91ce9dfc427dbc13873d7875ac82bb4e8a5b52e | https://explorer.testnet.arc.io/address/0xb91ce9dfc427dbc13873d7875ac82bb4e8a5b52e |
| VoiceConsult (v3, +permit) | Arc Testnet | 0x4d95397f7ae25f92b85aed41afdb96cf470fe132 | https://explorer.testnet.arc.io/address/0x4d95397f7ae25f92b85aed41afdb96cf470fe132 |
| VoiceConsult (v4, +ratings) | Arc Testnet | 0x5f7fda08a039b83e36560908e4f6ce18f2850a42 | https://explorer.testnet.arc.io/address/0x5f7fda08a039b83e36560908e4f6ce18f2850a42 |
| VoiceConsult (v5, +scheduling) | Arc Testnet | 0x6c5bc6a080b48b3abf9d1cee26ea9c2c6e2c102f | https://explorer.testnet.arc.io/address/0x6c5bc6a080b48b3abf9d1cee26ea9c2c6e2c102f |

Constructor args: `(usdcToken=0x3600..., platformTreasury=0x5B12..., platformFeeBps=200, initialOwner=0x5B12...)`

## Contract Architecture

`VoiceConsult.sol` — escrow contract with pull-based payouts

Session lifecycle: `Pending → ExpertReady → Active → Completed / Cancelled`
- `registerExpert(ratePerMinute, name, bio)` — any wallet can register
- `requestSession(expert, durationSeconds)` — user pre-pays USDC (USDC approve required first)
- `acceptSession(sessionId)` — expert accepts; sets status to ExpertReady
- `confirmSessionStart(sessionId)` — user confirms; starts billing timer (prevents expert gaming)
- `endSession(sessionId)` — either party; proportional payout to pendingWithdrawals
- `cancelSession(sessionId)` — user only, in Pending or ExpertReady; full refund
- `withdraw()` — any party claims their pendingWithdrawals balance

Security: ReentrancyGuard, SafeERC20, pull-based payouts, checks-effects-interactions, two-step start handshake, fee-on-transfer protection.

## Key Files

- `src/App.tsx` — top-level routing and shell (header, bottom nav)
- `src/contracts.ts` — contract address, ABI import
- `src/hooks/useVoiceConsult.ts` — all wagmi hooks for contract reads/writes
- `src/hooks/useWebRTC.ts` — WebRTC P2P audio hook (signaling via localStorage)
- `src/components/ExpertList.tsx` — expert marketplace
- `src/components/ExpertCard.tsx` — individual expert card
- `src/components/RegisterExpert.tsx` — expert registration/update form
- `src/components/SessionRequest.tsx` — USDC approve + requestSession flow
- `src/components/CallRoom.tsx` — live session management (accept, confirm, end, withdraw)
- `src/components/SessionHistory.tsx` — user's session list

## WebRTC Signaling Note

Signaling uses localStorage (keyed by sessionId) for same-browser demos. For cross-device use, the offer/answer must be exchanged out-of-band. A production version would use a dedicated WebSocket signaling server.

## To Run

```bash
bun install
bun run dev
```

## Testing

1. Get Arc Testnet USDC via "Get test USDC" in the Arc Studio sidebar
2. Register as an expert (set your rate)
3. From a second wallet, book a session
4. Accept the session as the expert
5. Confirm start as the user — billing begins
6. End the session — USDC released proportionally
7. Withdraw your USDC from pendingWithdrawals
