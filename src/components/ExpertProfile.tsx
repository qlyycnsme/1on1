import { useEffect } from 'react'
import { X, User, Clock, Star, TrendingUp } from 'lucide-react'
import {
  useExpert, useExpertSessionIds, useSession, useSessionRatings,
  formatUsdcAmount, expertAvgRating, SessionStatus,
} from '@/hooks/useVoiceConsult'
import { RatingDisplay } from './RatingStars'
import { useLocale } from '@/hooks/useLocale'

interface Props {
  expertAddr: string
  onClose: () => void
}

function SessionRow({ sessionId }: { sessionId: bigint }) {
  const { data: rawSession } = useSession(sessionId)
  const { data: rawRatings } = useSessionRatings(sessionId)
  const { t } = useLocale()

  const session = rawSession as {
    id: bigint; user: string; expert: string; totalAmount: bigint;
    bookedDuration: number; startTime: number; endTime: number; status: number
  } | undefined

  const ratings = rawRatings as [number, number] | undefined

  if (!session || session.id === 0n) return null
  if (session.status !== (SessionStatus.Completed as number)) return null

  const actualSecs = session.endTime > 0 && session.startTime > 0
    ? session.endTime - session.startTime
    : null
  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  const date = new Date(session.endTime * 1000).toLocaleDateString()
  const userScore = ratings?.[0] ?? 0
  const expertScore = ratings?.[1] ?? 0
  const earned = formatUsdcAmount(session.totalAmount)
  const shortUser = `${session.user.slice(0, 6)}…${session.user.slice(-4)}`

  return (
    <div
      className="rounded-2xl p-3.5 text-sm"
      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="mono text-xs" style={{ color: 'var(--subtle)' }}>{shortUser}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{date}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="tabular-nums font-semibold text-xs" style={{ color: 'var(--ink)' }}>
            {earned} <span style={{ color: 'var(--subtle)', fontWeight: 400 }}>USDC</span>
          </p>
          {actualSecs !== null && (
            <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
              {fmt(actualSecs)} / {fmt(session.bookedDuration)}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {userScore > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>{t.clientRating}:</span>
            <div className="flex items-center gap-0.5">
              {[1,2,3,4,5].map(n => (
                <span key={n} style={{ color: n <= userScore ? '#e11d48' : 'var(--subtle)', fontSize: '0.7rem' }}>♥</span>
              ))}
            </div>
          </div>
        )}
        {expertScore > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>{t.expertRatingGiven}:</span>
            <div className="flex items-center gap-0.5">
              {[1,2,3,4,5].map(n => (
                <span key={n} style={{ color: n <= expertScore ? '#e11d48' : 'var(--subtle)', fontSize: '0.7rem' }}>♥</span>
              ))}
            </div>
          </div>
        )}
        {userScore === 0 && expertScore === 0 && (
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>{t.notYetRated}</span>
        )}
      </div>
    </div>
  )
}

export function ExpertProfile({ expertAddr, onClose }: Props) {
  const { t } = useLocale()
  const { data: rawExpert } = useExpert(expertAddr)
  const { data: rawSessionIds } = useExpertSessionIds(expertAddr)

  const expert = rawExpert as {
    addr: string; ratePerMinute: bigint; minimumFee: bigint;
    name: string; bio: string; isActive: boolean;
    totalEarned: bigint; sessionsCompleted: bigint;
    totalRatingSum: bigint; ratingCount: bigint;
  } | undefined

  const sessionIds = rawSessionIds as bigint[] | undefined

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const avg = expert ? expertAvgRating(expert) : null
  const ratingCount = expert ? Number(expert.ratingCount) : 0
  const shortAddr = `${expertAddr.slice(0, 6)}…${expertAddr.slice(-4)}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{
          background: 'var(--surface-strong)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white font-bold text-lg"
              style={{ background: 'var(--accent)' }}
            >
              {expert?.name ? expert.name[0].toUpperCase() : <User className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="display font-bold text-base" style={{ color: 'var(--ink)' }}>
                {expert?.name || t.unnamed}
              </h2>
              <p className="mono text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{shortAddr}</p>
              <div className="mt-1.5">
                <RatingDisplay avg={avg} count={ratingCount} />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-muted)]"
            style={{ color: 'var(--muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Bio */}
          {expert?.bio && (
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{expert.bio}</p>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-3" style={{ background: 'var(--surface-muted)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="h-3.5 w-3.5" style={{ color: 'var(--muted)' }} />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.rateLabel}</span>
              </div>
              <p className="display font-bold text-sm tabular-nums" style={{ color: 'var(--ink)' }}>
                {expert ? formatUsdcAmount(expert.ratePerMinute) : '—'} <span style={{ color: 'var(--subtle)', fontWeight: 400, fontSize: '0.7rem' }}>USDC{t.perMin}</span>
              </p>
            </div>
            <div className="rounded-2xl p-3" style={{ background: 'var(--surface-muted)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Star className="h-3.5 w-3.5" style={{ color: 'var(--muted)' }} />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.sessions}</span>
              </div>
              <p className="display font-bold text-sm tabular-nums" style={{ color: 'var(--ink)' }}>
                {expert?.sessionsCompleted.toString() ?? '—'}
              </p>
            </div>
            {expert && expert.minimumFee > 0n && (
              <div className="rounded-2xl p-3 col-span-2" style={{ background: 'var(--surface-muted)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-3.5 w-3.5" style={{ color: 'var(--accent-hover)' }} />
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.minFeeLabel}</span>
                </div>
                <p className="display font-bold text-sm tabular-nums" style={{ color: 'var(--ink)' }}>
                  {formatUsdcAmount(expert.minimumFee)} <span style={{ color: 'var(--subtle)', fontWeight: 400, fontSize: '0.7rem' }}>USDC</span>
                </p>
              </div>
            )}
          </div>

          {/* Session history */}
          <div>
            <h3 className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              {t.sessionHistory}
            </h3>
            {(!sessionIds || sessionIds.length === 0) ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--subtle)' }}>{t.noHistoryYet}</p>
            ) : (
              <div className="space-y-2">
                {[...sessionIds].reverse().map(id => (
                  <SessionRow key={id.toString()} sessionId={id} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
