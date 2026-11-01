import { Loader2, Clock, CheckCircle, XCircle, PhoneCall } from 'lucide-react'
import { useUserSessionIds, useExpertSessionIds, useSession, formatUsdcAmount, SessionStatus } from '@/hooks/useVoiceConsult'
import { useAccount } from 'wagmi'
import { useLocale } from '@/hooks/useLocale'

interface Props {
  onViewSession: (sessionId: bigint) => void
}

function SessionRow({ sessionId, onView, currentAddress }: { sessionId: bigint; onView: (id: bigint) => void; currentAddress: string }) {
  const { data: session } = useSession(sessionId)
  const { t } = useLocale()
  const s = session as {
    id: bigint; user: string; expert: string; totalAmount: bigint;
    bookedDuration: number; startTime: number; endTime: number; status: number
  } | undefined

  if (!s || s.id === 0n) return null

  const status: SessionStatus = s.status
  const isUser = s.user.toLowerCase() === currentAddress.toLowerCase()

  const statusConfig = {
    [SessionStatus.Pending]: { label: t.statusPending, color: 'var(--muted)', Icon: Clock },
    [SessionStatus.ExpertReady]: { label: t.statusExpertReady, color: 'var(--accent-hover)', Icon: Clock },
    [SessionStatus.Active]: { label: t.statusActive, color: 'var(--success)', Icon: PhoneCall },
    [SessionStatus.Completed]: { label: t.statusCompleted, color: 'var(--success)', Icon: CheckCircle },
    [SessionStatus.Cancelled]: { label: t.statusCancelled, color: 'var(--danger)', Icon: XCircle },
  }

  const { label, color, Icon } = statusConfig[status] ?? statusConfig[SessionStatus.Pending]
  const counterparty = isUser ? s.expert : s.user
  const shortAddr = `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}`

  function formatDur(secs: number) {
    const m = Math.floor(secs / 60)
    const s2 = secs % 60
    if (s2 > 0) return `${m}m ${s2}s`
    return `${m}m`
  }

  return (
    <button
      onClick={() => onView(sessionId)}
      className="w-full rounded-2xl p-4 text-left transition-all hover:scale-[1.01]"
      style={{
        background: 'var(--surface-strong)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" style={{ color }} />
          <span className="text-xs font-semibold" style={{ color }}>{label}</span>
        </div>
        <span className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
          #{sessionId.toString()}
        </span>
      </div>
      <div className="flex justify-between items-baseline">
        <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {isUser ? t.asUser : t.asExpert} · <span className="mono text-xs">{shortAddr}</span>
        </span>
        <span className="text-sm tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>
          {formatUsdcAmount(s.totalAmount)} USDC
        </span>
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
        {t.booked2} {formatDur(s.bookedDuration)}
        {s.startTime > 0 && s.endTime > 0 && ` · ${t.actual} ${formatDur(s.endTime - s.startTime)}`}
      </div>
    </button>
  )
}

export function SessionHistory({ onViewSession }: Props) {
  const { address } = useAccount()
  const { data: userSessions, isLoading: uLoading } = useUserSessionIds(address)
  const { data: expertSessions, isLoading: eLoading } = useExpertSessionIds(address)
  const { t } = useLocale()

  const allIds = Array.from(new Set([
    ...((userSessions as bigint[] | undefined) ?? []).map(id => id.toString()),
    ...((expertSessions as bigint[] | undefined) ?? []).map(id => id.toString()),
  ])).map(id => BigInt(id)).sort((a, b) => (a > b ? -1 : 1))

  const isLoading = uLoading || eLoading

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6">
      <h2 className="display text-xl font-bold mb-4" style={{ color: 'var(--ink)' }}>{t.mySessions}</h2>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: 'var(--subtle)' }} />
        </div>
      ) : allIds.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--subtle)' }} />
          <p className="font-medium" style={{ color: 'var(--ink)' }}>{t.noSessions}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{t.noSessionsDesc}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allIds.map(id => (
            <SessionRow
              key={id.toString()}
              sessionId={id}
              onView={onViewSession}
              currentAddress={address ?? ''}
            />
          ))}
        </div>
      )}
    </div>
  )
}
