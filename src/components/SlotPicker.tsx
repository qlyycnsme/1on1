/**
 * SlotPicker — user browses an expert's open slots and books one.
 * Also shows "Claim No-Show" button when the expert didn't respond in time.
 */
import { useState } from 'react'
import { X, Calendar, Loader2, AlertTriangle, Clock, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import {
  useExpertSlotIds, useGetSlot, useBookSlot, useClaimNoShow,
  SlotStatus, SLOT_DEPOSIT, NO_SHOW_GRACE, formatUsdcAmount,
  type Slot, type Expert,
} from '@/hooks/useVoiceConsult'
import { useAccount, useReadContract } from 'wagmi'
import { useLocale } from '@/hooks/useLocale'
import { USDC_ADDRESS, USDC_ABI } from '@/contracts'
import { ARC_TESTNET_ID } from '@/hooks/useVoiceConsult'

function SlotRow({
  slotId,
  currentUser,
  expert,
  userBalance,
  onBooked,
}: {
  slotId: bigint
  currentUser?: string
  expert: Expert
  userBalance: bigint
  onBooked: (sessionId: bigint) => void
}) {
  const { t } = useLocale()
  const { data: rawSlot, refetch } = useGetSlot(slotId)
  const slot = rawSlot as Slot | undefined
  const bookHook = useBookSlot()
  const claimHook = useClaimNoShow()
  // Snapshot timestamp at mount — stable across renders, no impure call in render body
  const [now] = useState(() => Math.floor(Date.now() / 1000))

  if (!slot || slot.id === 0n) return null

  const isBooked = slot.status === SlotStatus.Booked
  const isOpen = slot.status === SlotStatus.Open
  const isPast = slot.scheduledTime < now
  const isMyBooking = isBooked && slot.bookedBy?.toLowerCase() === currentUser?.toLowerCase()
  const canClaimNoShow = isMyBooking && now >= slot.scheduledTime + NO_SHOW_GRACE

  // Hide completed, cancelled, no-show, and unbooked past slots
  if (slot.status === SlotStatus.Completed || slot.status === SlotStatus.Cancelled || slot.status === SlotStatus.NoShow) return null
  if (isOpen && isPast) return null

  const date = new Date(slot.scheduledTime * 1000)
  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  const timeUntil = slot.scheduledTime - now

  // Session cost = ceil(ratePerMinute * durationSeconds / 60) — matches contract
  const sessionCost = (expert.ratePerMinute * BigInt(slot.durationSeconds) + 59n) / 60n
  const hasEnoughBalance = userBalance >= sessionCost

  async function handleBook() {
    if (!slot) return
    try {
      const txHash = await bookHook.bookSlot(slotId, expert.ratePerMinute, slot.durationSeconds)
      toast.success(t.slotBookedToast)
      void refetch()
      // The returned tx receipt contains the sessionId — for now navigate to history
      // (wagmi doesn't decode return values; user goes to My Sessions to find it)
      onBooked(0n)
      void txHash
    } catch (err) { toast.error((err as Error).message?.slice(0, 80) ?? t.genericFail) }
  }

  async function handleClaimNoShow() {
    try {
      await claimHook.claimNoShow(slotId)
      toast.success(t.noShowClaimed)
      void refetch()
    } catch (err) { toast.error((err as Error).message?.slice(0, 80) ?? t.genericFail) }
  }

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'var(--surface-muted)',
        border: `1px solid ${isMyBooking ? 'rgba(18,45,69,0.2)' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {fmt(slot.durationSeconds)} {t.duration}
            {timeUntil > 0 && ` · ${t.inTime} ${Math.floor(timeUntil / 3600)}h ${Math.floor((timeUntil % 3600) / 60)}m`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {isMyBooking && (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--accent)' }}>
              {t.myBooking}
            </span>
          )}
          {isOpen && (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums" style={{ background: 'rgba(18,45,69,0.06)', color: 'var(--ink-2)' }}>
              {formatUsdcAmount(sessionCost)} USDC
            </span>
          )}
        </div>
      </div>

      {isOpen && !isPast && !hasEnoughBalance && (
        <div className="flex items-center gap-2 mb-2 rounded-xl px-3 py-2" style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.15)' }}>
          <Wallet className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--danger)' }} />
          <p className="text-xs" style={{ color: 'var(--danger)' }}>
            {t.insufficientBalance} · {t.youHave} {formatUsdcAmount(userBalance)} USDC
          </p>
        </div>
      )}

      {isOpen && !isPast && (
        <button
          disabled={bookHook.isPending || bookHook.isConfirming || !hasEnoughBalance}
          onClick={() => { void handleBook() }}
          className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)' }}
        >
          {bookHook.isPending || bookHook.isConfirming
            ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t.confirming}</span>
            : `${t.bookSlotBtn} · ${formatUsdcAmount(sessionCost)} USDC`}
        </button>
      )}

      {canClaimNoShow && (
        <button
          disabled={claimHook.isPending || claimHook.isConfirming}
          onClick={() => { void handleClaimNoShow() }}
          className="w-full rounded-xl py-2.5 text-sm font-semibold transition-all hover:scale-[1.01] disabled:opacity-40"
          style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)', border: '1px solid rgba(186,43,76,0.2)' }}
        >
          {claimHook.isPending || claimHook.isConfirming
            ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t.confirming}</span>
            : t.claimNoShow}
        </button>
      )}

      {isMyBooking && !canClaimNoShow && (
        <div className="flex items-center gap-2 mt-1">
          <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted)' }} />
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.waitingForExpert}</p>
        </div>
      )}
    </div>
  )
}

interface Props {
  expert: Expert
  onBack: () => void
  onSessionStarted: () => void
}

export function SlotPicker({ expert, onBack, onSessionStarted }: Props) {
  const { address } = useAccount()
  const { t } = useLocale()
  const { data: rawSlotIds } = useExpertSlotIds(expert.addr)
  const slotIds = (rawSlotIds as bigint[] | undefined) ?? []
  const [showAll, setShowAll] = useState(false)

  // Read user's live USDC balance for pre-flight checks on each slot
  const { data: rawBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address },
  })
  const userBalance = (rawBalance) ?? 0n

  const displayedIds = showAll ? slotIds : slotIds.slice(-10).reverse()

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:scale-[1.04]"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        >
          <X className="h-4 w-4" style={{ color: 'var(--ink-2)' }} />
        </button>
        <div>
          <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            {expert.name || t.unnamed}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{t.slotPickerSubtitle}</p>
        </div>
      </div>

      {/* No-show note */}
      <div className="rounded-2xl p-3 mb-5 flex items-start gap-2" style={{ background: 'rgba(18,45,69,0.04)', border: '1px solid var(--border)' }}>
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
        <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
          {t.noShowNote(formatUsdcAmount(SLOT_DEPOSIT))}
        </p>
      </div>

      {slotIds.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--subtle)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t.noOpenSlots}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{t.noOpenSlotsDesc}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {displayedIds.map(id => (
              <SlotRow
                key={id.toString()}
                slotId={id}
                currentUser={address}
                expert={expert}
                userBalance={userBalance}
                onBooked={() => onSessionStarted()}
              />
            ))}
          </div>
          {slotIds.length > 10 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full mt-4 rounded-2xl py-2.5 text-sm font-medium"
              style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
            >
              {t.showAllSlots(slotIds.length)}
            </button>
          )}
        </>
      )}
    </div>
  )
}
