import { useRef, useState } from 'react'
import {
  Camera, User, Star, Clock, TrendingUp, ChevronLeft,
  Loader2, CheckCircle, Heart, CalendarDays
} from 'lucide-react'
import { toast } from 'sonner'
import { useAccount } from 'wagmi'
import {
  useExpert, useExpertSessionIds, useUserSessionIds, useSession, useSessionRatings,
  formatUsdcAmount, expertAvgRating, SessionStatus, type Expert,
} from '@/hooks/useVoiceConsult'
import { RatingDisplay } from './RatingStars'
import { useProfile, useReadProfile, fileToDataUrl } from '@/hooks/useProfile'
import { useLocale } from '@/hooks/useLocale'

// ─── Single session row ───────────────────────────────────────────────────────

function fmt(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

function ProfileSessionRow({
  sessionId,
  viewerAddr,
}: {
  sessionId: bigint
  viewerAddr: string
}) {
  const { data: rawSession } = useSession(sessionId)
  const { data: rawRatings } = useSessionRatings(sessionId)
  const { t } = useLocale()

  const session = rawSession as {
    id: bigint; user: string; expert: string; totalAmount: bigint
    bookedDuration: number; startTime: number; endTime: number; status: number
  } | undefined

  const ratings = rawRatings as [number, number] | undefined

  if (!session || session.id === 0n) return null
  if ((session.status) !== (SessionStatus.Completed as number)) return null

  const isExpert = session.expert.toLowerCase() === viewerAddr.toLowerCase()
  const peer = isExpert ? session.user : session.expert
  const shortPeer = `${peer.slice(0, 6)}…${peer.slice(-4)}`
  const actualSecs = session.endTime > 0 && session.startTime > 0
    ? Math.min(session.endTime - session.startTime, session.bookedDuration)
    : null
  const date = new Date((session.endTime || session.startTime) * 1000).toLocaleDateString()
  const userScore = ratings?.[0] ?? 0
  const expertScore = ratings?.[1] ?? 0

  // Amount shown: for expert = their earned share (approx: totalAmount * actual/booked * 0.98),
  // for user = total paid. Show total for simplicity; exact payout is in CallRoom.
  const amountDisplay = formatUsdcAmount(session.totalAmount)

  return (
    <div
      className="rounded-2xl p-3.5"
      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{
                background: isExpert ? 'rgba(18,45,69,0.08)' : 'rgba(26,128,71,0.08)',
                color: isExpert ? 'var(--accent)' : 'var(--success)',
              }}
            >
              {isExpert ? t.asExpert : t.asUser}
            </span>
            <span className="mono text-xs truncate" style={{ color: 'var(--subtle)' }}>{shortPeer}</span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{date}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="tabular-nums font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            {amountDisplay} <span style={{ color: 'var(--subtle)', fontWeight: 400 }}>USDC</span>
          </p>
          {actualSecs !== null && (
            <p className="text-xs tabular-nums mt-0.5" style={{ color: 'var(--muted)' }}>
              {fmt(actualSecs)} / {fmt(session.bookedDuration)}
            </p>
          )}
        </div>
      </div>

      {/* Ratings row */}
      {(userScore > 0 || expertScore > 0) && (
        <div className="flex items-center gap-3 flex-wrap mt-1">
          {userScore > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>{t.clientRating}:</span>
              {[1,2,3,4,5].map(n => (
                <Heart key={n} className="h-3 w-3"
                  style={{ fill: n <= userScore ? '#e11d48' : 'transparent', color: n <= userScore ? '#e11d48' : 'var(--subtle)' }} />
              ))}
            </div>
          )}
          {expertScore > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>{t.expertRatingGiven}:</span>
              {[1,2,3,4,5].map(n => (
                <Heart key={n} className="h-3 w-3"
                  style={{ fill: n <= expertScore ? '#e11d48' : 'transparent', color: n <= expertScore ? '#e11d48' : 'var(--subtle)' }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Avatar display helper ────────────────────────────────────────────────────

function Avatar({
  src, name, size = 80, onClick,
}: { src: string | null; name: string; size?: number; onClick?: () => void }) {
  const initials = name?.trim()
    ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : null

  return (
    <div
      onClick={onClick}
      className={`relative shrink-0 overflow-hidden rounded-full flex items-center justify-center font-bold text-white ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        width: size,
        height: size,
        background: src ? 'transparent' : 'var(--accent)',
        fontSize: size * 0.35,
        flexShrink: 0,
      }}
    >
      {src
        ? <img src={src} alt="avatar" className="h-full w-full object-cover" />
        : initials
        ? <span>{initials}</span>
        : <User style={{ width: size * 0.45, height: size * 0.45 }} />
      }
    </div>
  )
}

// ─── Main ProfilePage ─────────────────────────────────────────────────────────

interface Props {
  /** Address whose profile to show. If undefined, show own profile. */
  targetAddr?: string
  onBack: () => void
  onViewSession?: (id: bigint) => void
  onManageSchedule?: () => void
}

export function ProfilePage({ targetAddr, onBack, onViewSession, onManageSchedule }: Props) {
  const { address: selfAddr } = useAccount()
  const profileAddr = targetAddr ?? selfAddr
  const isOwn = !targetAddr || targetAddr.toLowerCase() === selfAddr?.toLowerCase()
  const { t } = useLocale()

  // Contract data
  const { data: rawExpert, isLoading: expertLoading } = useExpert(profileAddr)
  const expert = rawExpert as Expert | undefined
  const isExpertRegistered = !!expert && expert.addr !== '0x0000000000000000000000000000000000000000'

  // Session IDs (both as user and as expert)
  const { data: expertSessions } = useExpertSessionIds(profileAddr)
  const { data: userSessions } = useUserSessionIds(profileAddr)
  const expertIds = (expertSessions as bigint[] | undefined) ?? []
  const userIds = (userSessions as bigint[] | undefined) ?? []
  // Merge + deduplicate, newest last (IDs are monotone; reverse for newest first)
  const allIds = [...new Set([...expertIds, ...userIds])].sort((a, b) => Number(b - a))

  // Avatar
  const { profile, setAvatar } = useProfile(isOwn ? profileAddr : undefined)
  const otherProfile = useReadProfile(!isOwn ? profileAddr : undefined)
  const avatarSrc = isOwn ? profile.avatar : otherProfile.avatar

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const avg = isExpertRegistered ? expertAvgRating(expert) : null
  const ratingCount = isExpertRegistered ? Number(expert.ratingCount) : 0

  const shortAddr = profileAddr
    ? `${profileAddr.slice(0, 6)}…${profileAddr.slice(-4)}`
    : '—'

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      setAvatar(dataUrl)
      toast.success(t.avatarUpdated)
    } catch {
      toast.error(t.avatarFailed)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function handleRemoveAvatar() {
    setAvatar(null)
    toast.success(t.avatarRemoved)
  }

  return (
    <div className="w-full max-w-lg mx-auto px-4 py-6">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm mb-5 transition-opacity hover:opacity-70"
        style={{ color: 'var(--muted)' }}
      >
        <ChevronLeft className="h-4 w-4" />
        {t.back}
      </button>

      {/* Hero card */}
      <div
        className="rounded-3xl p-6 mb-5"
        style={{
          background: 'var(--surface-strong)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 24px rgba(18,45,69,0.08)',
        }}
      >
        {/* Avatar row */}
        <div className="flex items-start gap-4 mb-4">
          <div className="relative">
            <Avatar
              src={avatarSrc}
              name={isExpertRegistered ? expert.name : ''}
              size={72}
              onClick={isOwn ? () => fileInputRef.current?.click() : undefined}
            />
            {isOwn && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 text-white transition-all hover:scale-110 disabled:opacity-50"
                style={{ background: 'var(--accent)', borderColor: 'var(--surface-strong)' }}
                aria-label={t.uploadAvatar}
              >
                {uploading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Camera className="h-3.5 w-3.5" />
                }
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { void handleFileChange(e) }}
            />
          </div>

          <div className="flex-1 min-w-0">
            {expertLoading ? (
              <div className="h-5 w-32 rounded-lg animate-pulse mb-1" style={{ background: 'var(--surface-muted)' }} />
            ) : (
              <h2 className="display font-bold text-xl truncate" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                {isExpertRegistered && expert.name ? expert.name : t.unnamed}
              </h2>
            )}
            <p className="mono text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{shortAddr}</p>
            {avg !== null && (
              <div className="mt-2">
                <RatingDisplay avg={avg} count={ratingCount} />
              </div>
            )}
          </div>
        </div>

        {/* Bio */}
        {isExpertRegistered && expert.bio && (
          <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>{expert.bio}</p>
        )}

        {/* Remove avatar (own profile, avatar set) */}
        {isOwn && avatarSrc && (
          <button
            onClick={handleRemoveAvatar}
            className="text-xs transition-opacity hover:opacity-70"
            style={{ color: 'var(--muted)' }}
          >
            {t.removeAvatar}
          </button>
        )}

        {/* Avatar note */}
        {isOwn && (
          <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
            {t.avatarLocalNote}
          </p>
        )}

        {/* Stats grid */}
        {isExpertRegistered && (
          <div
            className="grid grid-cols-3 gap-3 mt-4 pt-4"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Star className="h-3.5 w-3.5" style={{ color: 'var(--muted)' }} />
              </div>
              <p className="display tabular-nums font-bold text-lg" style={{ color: 'var(--ink)' }}>
                {expert.sessionsCompleted.toString()}
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.sessionsLabel}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Clock className="h-3.5 w-3.5" style={{ color: 'var(--muted)' }} />
              </div>
              <p className="display tabular-nums font-bold text-lg" style={{ color: 'var(--ink)' }}>
                {formatUsdcAmount(expert.ratePerMinute)}
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.perMin}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <TrendingUp className="h-3.5 w-3.5" style={{ color: 'var(--muted)' }} />
              </div>
              <p className="display tabular-nums font-bold text-lg" style={{ color: 'var(--ink)' }}>
                {formatUsdcAmount(expert.totalEarned)}
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.totalEarned}</p>
            </div>
          </div>
        )}

        {/* Manage Schedule CTA — own expert profile only */}
        {isOwn && isExpertRegistered && onManageSchedule && (
          <button
            onClick={onManageSchedule}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <CalendarDays className="h-4 w-4" />
            {t.scheduleTitle}
          </button>
        )}

        {/* Register as expert CTA — own profile, not yet an expert */}
        {isOwn && !isExpertRegistered && onManageSchedule && (
          <button
            onClick={onManageSchedule}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
          >
            <User className="h-4 w-4" />
            {t.registerTitle}
          </button>
        )}
      </div>

      {/* Session history */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="display font-semibold text-base" style={{ color: 'var(--ink)' }}>
            {t.sessionHistory}
          </h3>
          {allIds.length > 0 && (
            <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
              {allIds.length} {t.sessionsLabel}
            </span>
          )}
        </div>

        {allIds.length === 0 ? (
          <div
            className="rounded-3xl p-8 text-center"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
          >
            <CheckCircle className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--subtle)' }} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{t.noHistoryYet}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {allIds.map(id => (
              <div
                key={id.toString()}
                onClick={() => onViewSession?.(id)}
                className={onViewSession ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
              >
                <ProfileSessionRow sessionId={id} viewerAddr={profileAddr ?? ''} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
