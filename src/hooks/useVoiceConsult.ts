import { useState } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useSignTypedData, usePublicClient } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { VOICE_CONSULT, VOICE_CONSULT_ADDRESS, USDC_ADDRESS, USDC_ABI } from '@/contracts'
import { arcTestnet } from 'viem/chains'

export const ARC_TESTNET_ID = arcTestnet.id

// ─── Types mirroring contract structs ─────────────────────────────────────────

export interface Expert {
  addr: string
  ratePerMinute: bigint       // USDC 6-decimal
  minimumFee: bigint          // USDC 6-decimal; 0 = no floor
  name: string
  bio: string
  isActive: boolean
  totalEarned: bigint
  sessionsCompleted: bigint
  totalRatingSum: bigint
  ratingCount: bigint
}

export enum SessionStatus {
  Pending = 0,
  ExpertReady = 1,
  Active = 2,
  Completed = 3,
  Cancelled = 4,
}

export interface Session {
  id: bigint
  user: string
  expert: string
  totalAmount: bigint
  bookedDuration: number
  startTime: number
  endTime: number
  status: SessionStatus
}

// ─── Slot types ───────────────────────────────────────────────────────────────

export enum SlotStatus {
  Open = 0,
  Booked = 1,
  Completed = 2,
  Cancelled = 3,
  NoShow = 4,
}

export interface Slot {
  id: bigint
  expert: string
  bookedBy: string
  sessionId: bigint
  scheduledTime: number   // unix seconds
  durationSeconds: number
  status: SlotStatus
}

export const SLOT_DEPOSIT = 1_000_000n  // 1 USDC (6 decimals)
export const NO_SHOW_GRACE = 120        // seconds

export function formatUsdcAmount(amount: bigint): string {
  return formatUnits(amount, 6)
}

export function parseUsdcAmount(amount: string): bigint {
  return parseUnits(amount, 6)
}

/** Compute total cost for a session: ratePerMinute * durationSeconds / 60, ceil */
export function computeSessionCost(ratePerMinute: bigint, durationSeconds: number): bigint {
  const numerator = ratePerMinute * BigInt(durationSeconds)
  return (numerator + 59n) / 60n
}

// ─── Read hooks ───────────────────────────────────────────────────────────────

export function useAllExpertAddresses() {
  return useReadContract({
    ...VOICE_CONSULT,
    functionName: 'getAllExpertAddresses',
    chainId: ARC_TESTNET_ID,
  })
}

export function useExpert(address: string | undefined) {
  return useReadContract({
    ...VOICE_CONSULT,
    functionName: 'getExpert',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address },
    chainId: ARC_TESTNET_ID,
  })
}

export function useSession(sessionId: bigint | undefined) {
  return useReadContract({
    ...VOICE_CONSULT,
    functionName: 'getSession',
    args: sessionId !== undefined ? [sessionId] : undefined,
    query: { enabled: sessionId !== undefined },
    chainId: ARC_TESTNET_ID,
  })
}

export function useUserSessionIds(address: string | undefined) {
  return useReadContract({
    ...VOICE_CONSULT,
    functionName: 'getUserSessionIds',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address },
    chainId: ARC_TESTNET_ID,
  })
}

export function useExpertSessionIds(address: string | undefined) {
  return useReadContract({
    ...VOICE_CONSULT,
    functionName: 'getExpertSessionIds',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address },
    chainId: ARC_TESTNET_ID,
  })
}

export function usePendingWithdrawals(address: string | undefined) {
  return useReadContract({
    ...VOICE_CONSULT,
    functionName: 'pendingWithdrawals',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address },
    chainId: ARC_TESTNET_ID,
  })
}

export function useUsdcBalance(address: string | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address },
    chainId: ARC_TESTNET_ID,
  })
}

export function useUsdcAllowance(owner: string | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: owner ? [owner as `0x${string}`, VOICE_CONSULT_ADDRESS] : undefined,
    query: { enabled: !!owner },
    chainId: ARC_TESTNET_ID,
  })
}

// ─── Write hooks ──────────────────────────────────────────────────────────────

export function useRegisterExpert() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const register = async (ratePerMinute: bigint, minimumFee: bigint, name: string, bio: string) => {
    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'registerExpert',
      args: [ratePerMinute, minimumFee, name, bio],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { register, isPending, isConfirming, isSuccess, hash, error }
}

export function useApproveUsdc() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const approve = async (amount: bigint) => {
    return writeContractAsync({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'approve',
      args: [VOICE_CONSULT_ADDRESS, amount],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { approve, isPending, isConfirming, isSuccess, hash, error }
}

export function useRequestSession() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  const request = async (expertAddr: string, durationSeconds: number) => {
    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'requestSession',
      args: [expertAddr as `0x${string}`, durationSeconds],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { request, isPending, isConfirming, isSuccess, hash, receipt, error }
}

/**
 * Permit-based session request: one off-chain EIP-2612 sign (no gas) +
 * one on-chain requestSessionWithPermit tx.
 * If allowance already covers the cost the permit sign is skipped entirely.
 */
export function useRequestSessionWithPermit() {
  const { address } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })
  const publicClient = usePublicClient({ chainId: ARC_TESTNET_ID })

  // Signing state separate from tx pending
  const [isSigning, setIsSigning] = useState(false)

  const requestWithPermit = async (expertAddr: string, durationSeconds: number, cost: bigint) => {
    let v = 0, r = '0x' + '0'.repeat(64), s = '0x' + '0'.repeat(64)
    let deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

    if (cost > 0n && address) {
      setIsSigning(true)
      try {
        // Read the live nonce — must match exactly what the USDC contract holds
        const nonce = publicClient ? await publicClient.readContract({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'nonces',
          args: [address],
        }) : 0n

        const sig = await signTypedDataAsync({
          domain: {
            // Arc Testnet USDC EIP-712 domain: name="USDC", version="2"
            name: 'USDC',
            version: '2',
            chainId: ARC_TESTNET_ID,
            verifyingContract: USDC_ADDRESS,
          },
          types: {
            Permit: [
              { name: 'owner',   type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value',   type: 'uint256' },
              { name: 'nonce',   type: 'uint256' },
              { name: 'deadline',type: 'uint256' },
            ],
          },
          primaryType: 'Permit',
          message: {
            owner:    address,
            spender:  VOICE_CONSULT_ADDRESS,
            value:    cost,
            nonce,
            deadline,
          },
        })
        // Split compact 65-byte signature into v, r, s
        r = sig.slice(0, 66)
        s = ('0x' + sig.slice(66, 130))
        v = parseInt(sig.slice(130, 132), 16)
      } finally {
        setIsSigning(false)
      }
    }

    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'requestSessionWithPermit',
      args: [expertAddr as `0x${string}`, durationSeconds, deadline, v, r as `0x${string}`, s as `0x${string}`],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { requestWithPermit, isSigning, isPending, isConfirming, isSuccess, hash, receipt, error }
}

export function useAcceptSession() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const accept = async (sessionId: bigint) => {
    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'acceptSession',
      args: [sessionId],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { accept, isPending, isConfirming, isSuccess, hash, error }
}

export function useConfirmSessionStart() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const confirm = async (sessionId: bigint) => {
    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'confirmSessionStart',
      args: [sessionId],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { confirm, isPending, isConfirming, isSuccess, hash, error }
}

export function useEndSession() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const end = async (sessionId: bigint) => {
    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'endSession',
      args: [sessionId],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { end, isPending, isConfirming, isSuccess, hash, error }
}

export function useCancelSession() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const cancel = async (sessionId: bigint) => {
    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'cancelSession',
      args: [sessionId],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { cancel, isPending, isConfirming, isSuccess, hash, error }
}

/** Escape hatch: user cancels a session stuck in ExpertReady (non-slot) to recover escrow. */
export function useClaimExpertReadyTimeout() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const claimTimeout = async (sessionId: bigint) => {
    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'claimExpertReadyTimeout',
      args: [sessionId],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { claimTimeout, isPending, isConfirming, isSuccess, hash, error }
}

export function useWithdraw() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const withdraw = async () => {
    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'withdraw',
      args: [],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { withdraw, isPending, isConfirming, isSuccess, hash, error }
}

// ─── Slot hooks ───────────────────────────────────────────────────────────────

export function useGetSlot(slotId: bigint | undefined) {
  return useReadContract({
    ...VOICE_CONSULT,
    functionName: 'getSlot',
    args: slotId !== undefined ? [slotId] : undefined,
    query: { enabled: slotId !== undefined },
    chainId: ARC_TESTNET_ID,
  })
}

export function useExpertSlotIds(address: string | undefined) {
  return useReadContract({
    ...VOICE_CONSULT,
    functionName: 'getExpertSlotIds',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address },
    chainId: ARC_TESTNET_ID,
  })
}

export function useCreateSlot() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const createSlot = async (scheduledTime: number, durationSeconds: number) => {
    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'createSlot',
      args: [scheduledTime, durationSeconds],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { createSlot, isPending, isConfirming, isSuccess, hash, error }
}

export function useBookSlot() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const { signTypedDataAsync } = useSignTypedData()
  const publicClient = usePublicClient({ chainId: ARC_TESTNET_ID })
  const { address } = useAccount()
  const [isSigning, setIsSigning] = useState(false)

  // ratePerMinute and durationSeconds are needed to compute the permit amount.
  // They're passed in by the caller (SlotRow has them from slot + expert data).
  const bookSlot = async (slotId: bigint, ratePerMinute: bigint, durationSeconds: number) => {
    if (!address || !publicClient) throw new Error('Wallet not connected')

    // Compute cost: ceil(ratePerMinute * durationSeconds / 60)
    const cost = (ratePerMinute * BigInt(durationSeconds) + 59n) / 60n

    // Fetch current nonce from USDC contract
    const nonce = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'nonces',
      args: [address],
    })

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

    // Sign off-chain permit
    setIsSigning(true)
    let v: number, r: `0x${string}`, s: `0x${string}`
    try {
      const sig = await signTypedDataAsync({
        domain: {
          name: 'USDC',
          version: '2',
          chainId: ARC_TESTNET_ID,
          verifyingContract: USDC_ADDRESS,
        },
        types: {
          Permit: [
            { name: 'owner',   type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value',   type: 'uint256' },
            { name: 'nonce',   type: 'uint256' },
            { name: 'deadline',type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        message: {
          owner:    address,
          spender:  VOICE_CONSULT_ADDRESS,
          value:    cost,
          nonce,
          deadline,
        },
      })
      // Split compact signature into v, r, s
      r = `0x${sig.slice(2, 66)}`
      s = `0x${sig.slice(66, 130)}`
      v = parseInt(sig.slice(130, 132), 16)
    } finally {
      setIsSigning(false)
    }

    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'bookSlotWithPermit',
      args: [slotId, deadline, v, r, s],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { bookSlot, isPending: isPending || isSigning, isConfirming, isSuccess, hash, error }
}

export function useCancelSlot() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const cancelSlot = async (slotId: bigint) => {
    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'cancelSlot',
      args: [slotId],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { cancelSlot, isPending, isConfirming, isSuccess, hash, error }
}

export function useClaimNoShow() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const claimNoShow = async (slotId: bigint) => {
    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'claimNoShow',
      args: [slotId],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { claimNoShow, isPending, isConfirming, isSuccess, hash, error }
}

export function useClaimSlotDeposit() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const claimDeposit = async (slotId: bigint) => {
    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'claimSlotDeposit',
      args: [slotId],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { claimDeposit, isPending, isConfirming, isSuccess, hash, error }
}

export function useRateSession() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const rate = async (sessionId: bigint, score: number) => {
    return writeContractAsync({
      ...VOICE_CONSULT,
      functionName: 'rateSession',
      args: [sessionId, score],
      chainId: ARC_TESTNET_ID,
    })
  }

  return { rate, isPending, isConfirming, isSuccess, hash, error }
}

export function useSessionRatings(sessionId: bigint | undefined) {
  return useReadContract({
    ...VOICE_CONSULT,
    functionName: 'getSessionRatings',
    args: sessionId !== undefined ? [sessionId] : undefined,
    query: { enabled: sessionId !== undefined },
    chainId: ARC_TESTNET_ID,
  })
}

/** Compute average rating from expert stats. Returns null if no ratings yet. */
export function expertAvgRating(expert: Expert): number | null {
  if (expert.ratingCount === 0n) return null
  return Number(expert.totalRatingSum) / Number(expert.ratingCount)
}

// ─── Chain guard ──────────────────────────────────────────────────────────────

export function useIsCorrectChain() {
  const { chainId } = useAccount()
  return chainId === ARC_TESTNET_ID
}
