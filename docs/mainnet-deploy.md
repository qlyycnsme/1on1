# VoiceConsult — Arc Mainnet Deployment Guide

> **You are solely responsible for all mainnet actions. Real funds are at stake. Read every step carefully before executing.**

---

## Prerequisites

- Foundry installed locally: https://getfoundry.sh
- A deployer wallet with enough Arc mainnet USDC for gas (Arc uses USDC as native gas — a few dollars worth is sufficient)
- Your treasury/owner wallet: `0x101f731A2859602c3A4441144a133C7c00DCf6DB`

---

## Step 1 — Download the project source

Download the project from Arc Studio (Code panel → Download Code), then open a terminal in the project root.

---

## Step 2 — Set environment variables

Create a `.env` file in the project root (never commit this):

```bash
# Your deployer wallet private key (the wallet that pays gas)
PRIVATE_KEY=0xYOUR_DEPLOYER_PRIVATE_KEY

# Arc mainnet RPC
RPC_URL=https://rpc.mainnet.arc.io
```

Load them:
```bash
source .env
```

---

## Step 3 — Build the contract

```bash
cd contracts
forge build
```

Confirm it compiles cleanly before continuing.

---

## Step 4 — Deploy VoiceConsult to Arc mainnet

The constructor takes four arguments:
1. `usdcToken` — USDC ERC-20 on Arc mainnet: `0x3600000000000000000000000000000000000000`
2. `platformTreasury` — your treasury wallet: `0x101f731A2859602c3A4441144a133C7c00DCf6DB`
3. `platformFeeBps` — platform fee in basis points (200 = 2%)
4. `initialOwner` — your owner wallet: `0x101f731A2859602c3A4441144a133C7c00DCf6DB`

Run this command (replace `$PRIVATE_KEY`):

```bash
forge create contracts/VoiceConsult.sol:VoiceConsult \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --constructor-args \
    0x3600000000000000000000000000000000000000 \
    0x101f731A2859602c3A4441144a133C7c00DCf6DB \
    200 \
    0x101f731A2859602c3A4441144a133C7c00DCf6DB
```

On success, Foundry prints:
```
Deployed to: 0x<YOUR_NEW_CONTRACT_ADDRESS>
Transaction hash: 0x...
```

**Record the deployed address immediately.**

Verify on explorer: `https://explorer.arc.io/address/0x<YOUR_NEW_CONTRACT_ADDRESS>`

---

## Step 5 — Update the frontend

Open `src/hooks/contracts.ts` (or wherever `VOICE_CONSULT_ADDRESS` is defined) and replace the testnet address with your new mainnet address:

```ts
export const VOICE_CONSULT_ADDRESS = '0x<YOUR_NEW_CONTRACT_ADDRESS>' as const
export const ARC_CHAIN_ID = 5042  // Arc mainnet chain ID (was 5042002 on testnet)
```

Also update `src/config.ts` to set Arc mainnet (chain ID `5042`) as the default chain instead of Arc Testnet (chain ID `5042002`).

---

## Step 6 — Build and redeploy the frontend

```bash
# From the project root
bun install
bun run build
```

Then upload the `dist/` folder to your hosting provider (Netlify, Vercel, or any static host).

---

## Step 7 — Post-deployment checklist

Go through each item before announcing the app:

- [ ] Visit the explorer link for your deployed contract and confirm bytecode is present
- [ ] Register as an expert using your own wallet — confirm the `registerExpert` tx succeeds
- [ ] Create one test slot using a small deposit — confirm `createSlot` works
- [ ] Book the slot with a second wallet — confirm `bookSlotWithPermit` succeeds
- [ ] End the session and withdraw — confirm `endSession` + `withdraw` work end to end
- [ ] Confirm the 2% fee reached `0x101f731A2859602c3A4441144a133C7c00DCf6DB` via `pendingWithdrawals`

---

## Key contract facts (mainnet)

| Parameter | Value |
|---|---|
| USDC address | `0x3600000000000000000000000000000000000000` |
| Platform treasury | `0x101f731A2859602c3A4441144a133C7c00DCf6DB` |
| Initial owner | `0x101f731A2859602c3A4441144a133C7c00DCf6DB` |
| Platform fee | 200 bps = 2% |
| Fee change timelock | 48 hours |
| No-show grace period | 120 seconds |
| Slot deposit | 1 USDC |
| Chain ID | 5042 |
| RPC | https://rpc.mainnet.arc.io |
| Explorer | https://explorer.arc.io |

---

## Timelock admin operations (post-deploy)

To change the platform fee or treasury on mainnet, you must use the 2-step timelock:

### Queue a fee change (e.g. change to 3%):
```bash
cast send <CONTRACT_ADDRESS> \
  "queueFeeChange(uint16)" 300 \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $PRIVATE_KEY
```

### Execute after 48 hours:
```bash
cast send <CONTRACT_ADDRESS> \
  "executeFeeChange()" \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $PRIVATE_KEY
```

Same pattern for `queueTreasuryChange(address)` / `executeTreasuryChange()`.

---

## Security reminders

- Keep your deployer and owner private keys offline (hardware wallet recommended for the owner)
- The owner wallet (`0x101f731A2859602c3A4441144a133C7c00DCf6DB`) controls fee/treasury changes — protect it
- All user USDC is held in the contract's escrow; a compromised owner key cannot steal escrow funds (fees only)
- Monitor `pendingWithdrawals` for the treasury address to track accumulated fees
