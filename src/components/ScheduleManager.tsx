/**
 * ScheduleManager — expert manages their available time slots.
 * Create slots (1 USDC deposit each), cancel unbooked ones, claim deposit back.
 */
import { useState } from 'react'
import { CalendarPlus, X, Loader2, Clock, CheckCircle, AlertTriangle, Download } from 'lucide-react'
import { toast } from 'sonner'
import {
  useExpertSlotIds, useGetSlot, useCreateSlot, useCancelSlot, useClaimSlotDeposit,
  useApproveUsdc, SlotStatus, SLOT_DEPOSIT, formatUsdcAmount,
  type Slot,
} from '@/hooks/useVoiceConsult'
import { useAccount } from 'wagmi'
import { useLocale } from '@/hooks/useLocale'

const STATUS_COLORS: Record<number, string> = {
  [SlotStatus.Open]: 'var(--accent)',
  [SlotStatus.Booked]: '#d97706',
  [SlotStatus.Completed]: 'var(--success)',
  [SlotStatus.Cancelled]: 'var(--muted)',
  [SlotStatus.NoShow]: 'var(--danger)',
}

function SlotCard({ slotId, onRefresh }: { slotId: bigint; onRefresh: () => void }) {
  const { t } = useLocale()
  const { data: rawSlot, refetch } = useGetSlot(slotId)
  const slot = rawSlot as Slot | undefined
  const cancelHook = useCancelSlot()
  const claimHook = useClaimSlotDeposit()

  if (!slot || slot.id === 0n) return null

  const date = new Date(slot.scheduledTime * 1000)
  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  const statusLabels: Record<number, string> = {
    [SlotStatus.Open]: t.slotOpen,
    [SlotStatus.Booked]: t.slotBooked,
    [SlotStatus.Completed]: t.slotCompleted,
    [SlotStatus.Cancelled]: t.slotCancelled,
    [SlotStatus.NoShow]: t.slotNoShow,
  }

  const canCancel = slot.status === SlotStatus.Open
  const canClaimDeposit = slot.status === SlotStatus.Booked &&
    slot.sessionId > 0n

  async function handleCancel() {
    try {
      await cancelHook.cancelSlot(slotId)
      toast.success(t.slotCancelledToast)
      void refetch()
      onRefresh()
    } catch (err) { toast.error((err as Error).message?.slice(0, 80) ?? t.genericFail) }
  }

  async function handleClaimDeposit() {
    try {
      await claimHook.claimDeposit(slotId)
      toast.success(t.depositReclaimed)
      void refetch()
    } catch (err) { toast.error((err as Error).message?.slice(0, 80) ?? t.genericFail) }
  }

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {fmt(slot.durationSeconds)} · {t.slotDepositLabel}: {formatUsdcAmount(SLOT_DEPOSIT)} USDC
          </p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold shrink-0"
          style={{
            background: `${STATUS_COLORS[slot.status]}18`,
            color: STATUS_COLORS[slot.status],
          }}
        >
          {statusLabels[slot.status]}
        </span>
      </div>

      <div className="flex gap-2">
        {canCancel && (
          <button
            disabled={cancelHook.isPending || cancelHook.isConfirming}
            onClick={() => { void handleCancel() }}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all hover:scale-[1.02] disabled:opacity-40"
            style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}
          >
            {cancelHook.isPending || cancelHook.isConfirming
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <X className="h-3.5 w-3.5" />}
            {t.cancelSlot}
          </button>
        )}
        {canClaimDeposit && (
          <button
            disabled={claimHook.isPending || claimHook.isConfirming}
            onClick={() => { void handleClaimDeposit() }}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all hover:scale-[1.02] disabled:opacity-40"
            style={{ background: 'rgba(26,128,71,0.08)', color: 'var(--success)' }}
          >
            {claimHook.isPending || claimHook.isConfirming
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
            {t.reclaimDeposit}
          </button>
        )}
      </div>
    </div>
  )
}

interface Props {
  onBack: () => void
}

export function ScheduleManager({ onBack }: Props) {
  const { address } = useAccount()
  const { t } = useLocale()
  const { data: rawSlotIds, refetch } = useExpertSlotIds(address)
  const slotIds = (rawSlotIds as bigint[] | undefined) ?? []

  const createHook = useCreateSlot()
  const approveHook = useApproveUsdc()

  // Form state — todayStr computed once at mount via lazy initializer
  const [todayStr] = useState(() => new Date().toISOString().split('T')[0])
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState(30)

  async function handleCreate() {
    if (!date || !time) { toast.error(t.slotDateRequired); return }
    const scheduledTime = Math.floor(new Date(`${date}T${time}`).getTime() / 1000)
    if (scheduledTime <= Math.floor(Date.now() / 1000)) { toast.error(t.slotMustBeFuture); return }
    try {
      // Approve 1 USDC deposit
      await approveHook.approve(SLOT_DEPOSIT)
      await createHook.createSlot(scheduledTime, duration * 60)
      toast.success(t.slotCreated)
      setDate(''); setTime('')
      void refetch()
    } catch (err) { toast.error((err as Error).message?.slice(0, 80) ?? t.genericFail) }
  }

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
            {t.scheduleTitle}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{t.scheduleSubtitle}</p>
        </div>
      </div>

      {/* Create slot form */}
      <div
        className="rounded-3xl p-5 mb-6"
        style={{
          background: 'var(--surface-strong)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <CalendarPlus className="h-4 w-4" style={{ color: 'var(--accent)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t.addSlot}</p>
        </div>

        {/* Deposit notice */}
        <div className="flex items-start gap-2 rounded-2xl p-3 mb-4" style={{ background: 'rgba(18,45,69,0.04)' }}>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <p className="text-xs" style={{ color: 'var(--ink-2)' }}>{t.slotDepositNote}</p>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--muted)' }}>{t.slotDate}</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              min={todayStr}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--muted)' }}>{t.slotTime}</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--muted)' }}>{t.slotDuration}</label>
          <div className="flex gap-2">
            {[15, 30, 60].map(d => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className="flex-1 rounded-xl py-2 text-sm font-semibold transition-all"
                style={{
                  background: duration === d ? 'var(--accent)' : 'var(--surface-muted)',
                  color: duration === d ? 'white' : 'var(--ink-2)',
                  border: `1.5px solid ${duration === d ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {d} {t.min}
              </button>
            ))}
          </div>
        </div>

        <button
          disabled={approveHook.isPending || approveHook.isConfirming || createHook.isPending || createHook.isConfirming || !date || !time}
          onClick={() => { void handleCreate() }}
          className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition-all hover:scale-[1.01] disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {approveHook.isPending || approveHook.isConfirming ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t.approvingWallet}</span>
          ) : createHook.isPending || createHook.isConfirming ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t.confirming}</span>
          ) : (
            <span className="flex items-center justify-center gap-2"><Clock className="h-4 w-4" />{t.createSlotBtn}</span>
          )}
        </button>
      </div>

      {/* Slot list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t.mySlots}</p>
          {slotIds.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>{slotIds.length} {t.slotCount}</span>
          )}
        </div>
        {slotIds.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--subtle)' }} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{t.noSlots}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {[...slotIds].reverse().map(id => (
              <SlotCard key={id.toString()} slotId={id} onRefresh={() => { void refetch() }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
