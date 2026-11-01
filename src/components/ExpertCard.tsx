import { User, Clock, Star, TrendingUp } from 'lucide-react'
import type { Expert } from '@/hooks/useVoiceConsult'
import { formatUsdcAmount, expertAvgRating } from '@/hooks/useVoiceConsult'
import { RatingDisplay } from './RatingStars'
import { useLocale } from '@/hooks/useLocale'

interface Props {
  expert: Expert
  onBook: (expert: Expert) => void
  onViewProfile: (address: string) => void
  onViewSlots: (expert: Expert) => void
  isCurrentUser?: boolean
}

export function ExpertCard({ expert, onBook, onViewProfile, onViewSlots, isCurrentUser }: Props) {
  const { t } = useLocale()
  const rateDisplay = formatUsdcAmount(expert.ratePerMinute)
  const shortAddr = `${expert.addr.slice(0, 6)}...${expert.addr.slice(-4)}`
  const avg = expertAvgRating(expert)
  const ratingCount = Number(expert.ratingCount)

  return (
    <div
      className="rounded-3xl p-5 transition-all hover:scale-[1.01]"
      style={{
        background: 'var(--surface-strong)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 12px rgba(18,45,69,0.06)',
      }}
    >
      {/* Avatar + name row */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white font-semibold text-base"
          style={{ background: 'var(--accent)' }}
        >
          {expert.name ? expert.name[0].toUpperCase() : <User className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="display font-semibold text-base truncate" style={{ color: 'var(--ink)' }}>
              {expert.name || t.unnamed}
            </h3>
            {!expert.isActive && (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--danger)' }}>
                {t.inactive}
              </span>
            )}
            {isCurrentUser && (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--accent)' }}>
                {t.youBadge}
              </span>
            )}
          </div>
          <p className="mono text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{shortAddr}</p>
        </div>
      </div>

      {/* Bio */}
      {expert.bio && (
        <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--ink-2)' }}>{expert.bio}</p>
      )}

      {/* Rating */}
      {avg !== null && (
        <div className="mb-3">
          <RatingDisplay avg={avg} count={ratingCount} />
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4">
        <div className="flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5" style={{ color: 'var(--muted)' }} />
          <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
            {expert.sessionsCompleted.toString()} {t.sessions}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" style={{ color: 'var(--muted)' }} />
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
            {rateDisplay} USDC<span style={{ color: 'var(--muted)', fontWeight: 400 }}>{t.perMin}</span>
          </span>
        </div>
        {expert.minimumFee > 0n && (
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" style={{ color: 'var(--accent-hover)' }} />
            <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--accent-hover)' }}>
              {t.minFee} {formatUsdcAmount(expert.minimumFee)} USDC
            </span>
          </div>
        )}
      </div>

      {/* CTAs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onViewProfile(expert.addr)}
          className="rounded-2xl px-3 py-2.5 text-xs font-semibold transition-all hover:scale-[1.02]"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
        >
          {t.viewProfile}
        </button>
        {!isCurrentUser && expert.isActive && (
          <button
            onClick={() => onViewSlots(expert)}
            className="rounded-2xl px-3 py-2.5 text-xs font-semibold transition-all hover:scale-[1.02]"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
          >
            {t.viewSchedule}
          </button>
        )}
        <button
          disabled={!expert.isActive || isCurrentUser}
          onClick={() => onBook(expert)}
          className="flex-1 rounded-2xl py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 min-w-[80px]"
          style={{ background: 'var(--accent)' }}
        >
          {isCurrentUser ? t.isYou : expert.isActive ? t.bookNow : t.unavailable}
        </button>
      </div>
    </div>
  )
}
