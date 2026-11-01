import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, PhoneOff, Loader2, CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  useSession, useAcceptSession, useConfirmSessionStart, useEndSession, useCancelSession,
  useWithdraw, usePendingWithdrawals, useRateSession, useSessionRatings,
  useClaimExpertReadyTimeout,
  formatUsdcAmount, SessionStatus
} from '@/hooks/useVoiceConsult'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useAccount } from 'wagmi'
import { useLocale } from '@/hooks/useLocale'
import { RatingStars } from './RatingStars'

interface Props {
  sessionId: bigint
  onBack: () => void
}

function useElapsed(startTime: number, isActive: boolean) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isActive || !startTime) return
    const tick = () => setElapsed(Math.floor(Date.now() / 1000) - startTime)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isActive, startTime])
  return elapsed
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function CallRoom({ sessionId, onBack }: Props) {
  const { address } = useAccount()
  const { t } = useLocale()
  const { data: session, refetch } = useSession(sessionId)
  const s = session as {
    id: bigint; user: string; expert: string; totalAmount: bigint;
    bookedDuration: number; startTime: number; endTime: number; status: number
  } | undefined

  const sessionIdStr = sessionId.toString()
  const isUser = s?.user?.toLowerCase() === address?.toLowerCase()
  const isExpert = s?.expert?.toLowerCase() === address?.toLowerCase()
  const role = isExpert ? 'callee' : 'caller'

  const webrtc = useWebRTC(sessionIdStr, role)
  const elapsed = useElapsed(s?.startTime ?? 0, s?.status === SessionStatus.Active)

  const accept = useAcceptSession()
  const confirmStart = useConfirmSessionStart()
  const endSession = useEndSession()
  const cancel = useCancelSession()
  const _claimReadyTimeout = useClaimExpertReadyTimeout()
  const withdrawHook = useWithdraw()
  const rateHook = useRateSession()
  const { data: pendingRaw } = usePendingWithdrawals(address)
  const { data: ratingsRaw, refetch: refetchRatings } = useSessionRatings(sessionId)
  const ratings = ratingsRaw as [number, number] | undefined
  const pending = pendingRaw as bigint | undefined
  const hasPending = pending !== undefined && pending > 0n

  // Rating state
  const [myScore, setMyScore] = useState(0)
  const [ratingSubmitted, setRatingSubmitted] = useState(false)

  // Auto-join WebRTC when session becomes Active
  const didJoinRef = useRef(false)
  useEffect(() => {
    if (s?.status === SessionStatus.Active && !didJoinRef.current) {
      didJoinRef.current = true
      if (isExpert) void webrtc.joinCall()
      else void webrtc.startCall()
    }
  }, [s?.status, isExpert, webrtc])

  // Poll session state every 3s
  useEffect(() => {
    const id = setInterval(() => { void refetch() }, 3000)
    return () => clearInterval(id)
  }, [refetch])

  // Wire remote audio
  const audioRef = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    if (audioRef.current && webrtc.remoteStream) {
      audioRef.current.srcObject = webrtc.remoteStream
    }
  }, [webrtc.remoteStream])

  if (!s) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--subtle)' }} />
      </div>
    )
  }

  const status: SessionStatus = s.status
  const bookedDisplay = formatTime(s.bookedDuration)
  const totalDisplay = formatUsdcAmount(s.totalAmount)

  async function handleAccept() {
    try {
      await accept.accept(sessionId)
      toast.success(t.acceptedToast)
      void refetch()
    } catch (err) { toast.error((err as Error).message?.slice(0, 80) ?? t.genericFail) }
  }

  async function handleConfirmStart() {
    try {
      await confirmStart.confirm(sessionId)
      toast.success(t.startedToast)
      void refetch()
    } catch (err) { toast.error((err as Error).message?.slice(0, 80) ?? t.genericFail) }
  }

  async function handleEndSession() {
    try {
      webrtc.endCall()
      await endSession.end(sessionId)
      toast.success(t.endedToast)
      void refetch()
    } catch (err) { toast.error((err as Error).message?.slice(0, 80) ?? t.genericFail) }
  }

  async function handleCancel() {
    try {
      await cancel.cancel(sessionId)
      toast.success(t.cancelledToast)
      void refetch()
    } catch (err) { toast.error((err as Error).message?.slice(0, 80) ?? t.genericFail) }
  }

  async function handleWithdraw() {
    try {
      await withdrawHook.withdraw()
      toast.success(t.withdrawnToast)
    } catch (err) { toast.error((err as Error).message?.slice(0, 80) ?? t.withdrawFail) }
  }

  async function handleRate() {
    if (myScore < 1) return
    try {
      await rateHook.rate(sessionId, myScore)
      setRatingSubmitted(true)
      void refetchRatings()
      toast.success(t.ratingSubmitted)
    } catch (err) { toast.error((err as Error).message?.slice(0, 80) ?? t.genericFail) }
  }

  const shortUser = `${s.user.slice(0, 6)}...${s.user.slice(-4)}`
  const shortExpert = `${s.expert.slice(0, 6)}...${s.expert.slice(-4)}`

  // ─── Completed / Cancelled ───────────────────────────────────────────────────
  if (status === SessionStatus.Completed || status === SessionStatus.Cancelled) {
    // Determine if the current user has already rated this session
    const alreadyRatedByUser = isUser && (ratings?.[0] ?? 0) > 0
    const alreadyRatedByExpert = isExpert && (ratings?.[1] ?? 0) > 0
    const alreadyRated = alreadyRatedByUser || alreadyRatedByExpert || ratingSubmitted

    return (
      <div className="w-full max-w-md mx-auto px-4 py-6">
        <div
          className="rounded-3xl p-6"
          style={{
            background: 'var(--surface-strong)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-3xl mb-4"
            style={{ background: status === SessionStatus.Completed ? 'rgba(26,128,71,0.1)' : 'rgba(186,43,76,0.08)' }}>
            <CheckCircle className="h-7 w-7" style={{ color: status === SessionStatus.Completed ? 'var(--success)' : 'var(--danger)' }} />
          </div>
          <h3 className="display text-xl font-bold text-center mb-1" style={{ color: 'var(--ink)' }}>
            {status === SessionStatus.Completed ? t.callEnded : t.cancelled}
          </h3>
          {status === SessionStatus.Completed && s.endTime && s.startTime && (
            <p className="text-sm text-center mb-4" style={{ color: 'var(--muted)' }}>
              {t.actualDuration(formatTime(s.endTime - s.startTime), totalDisplay)}
            </p>
          )}

          {/* Rating section — only for completed sessions */}
          {status === SessionStatus.Completed && (isUser || isExpert) && (
            <div
              className="rounded-2xl p-4 mb-4"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}
            >
              {alreadyRated ? (
                <div className="text-center">
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>
                    {t.ratingSubmitted}
                  </p>
                  <RatingStars value={isUser ? (ratings?.[0] ?? myScore) : (ratings?.[1] ?? myScore)} size="md" />
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>
                    {isUser ? t.rateExpert : t.rateUser}
                  </p>
                  <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
                    {t.rateNote}
                  </p>
                  <div className="flex items-center justify-center mb-4">
                    <RatingStars value={myScore} onChange={setMyScore} size="lg" />
                  </div>
                  <button
                    disabled={myScore < 1 || rateHook.isPending || rateHook.isConfirming}
                    onClick={() => { void handleRate() }}
                    className="w-full rounded-2xl py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] disabled:opacity-40"
                    style={{ background: '#6366f1' }}
                  >
                    {rateHook.isPending || rateHook.isConfirming ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />{t.confirming}
                      </span>
                    ) : t.submitRating}
                  </button>
                </div>
              )}
            </div>
          )}

          {hasPending && (
            <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(26,128,71,0.06)', border: '1px solid rgba(26,128,71,0.2)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>{t.pendingBalance}</p>
              <p className="display text-xl font-bold tabular-nums" style={{ color: 'var(--success)' }}>
                {formatUsdcAmount(pending)} <span style={{ color: 'var(--subtle)', fontWeight: 400 }}>USDC</span>
              </p>
              <button
                disabled={withdrawHook.isPending || withdrawHook.isConfirming}
                onClick={() => { void handleWithdraw() }}
                className="mt-3 w-full rounded-2xl py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] disabled:opacity-40"
                style={{ background: 'var(--success)' }}
              >
                {withdrawHook.isPending || withdrawHook.isConfirming ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t.withdrawing}</span>
                ) : t.withdrawUsdc}
              </button>
            </div>
          )}

          <button onClick={onBack} className="w-full rounded-2xl py-3 text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>
            {t.backToMarket3}
          </button>
        </div>
      </div>
    )
  }

  // ─── Active call ─────────────────────────────────────────────────────────────
  if (status === SessionStatus.Active) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-6">
        {/* Hidden audio element for remote stream */}
        <audio ref={audioRef} autoPlay playsInline />

        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: 'var(--surface-strong)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid var(--border)',
          }}
        >
          {/* Spectral strip */}
          <div className="h-1" style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899, #f59e0b)' }} />

          <div className="p-6">
            {/* Timer */}
            <div className="text-center mb-6">
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
                {t.callingWith(isUser ? shortExpert : shortUser)}
              </p>
              <div className="display text-5xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                {formatTime(elapsed)}
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>/ {bookedDisplay} {t.booked}</p>
            </div>

            {/* WebRTC status */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <div
                className="h-2 w-2 rounded-full"
                style={{ background: webrtc.callState === 'connected' ? 'var(--success)' : 'var(--subtle)', boxShadow: webrtc.callState === 'connected' ? '0 0 6px var(--success)' : 'none' }}
              />
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {webrtc.callState === 'connected' ? t.voiceConnected : webrtc.callState === 'connecting' ? t.voiceConnecting : t.voiceDisconnected}
              </span>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={webrtc.toggleMute}
                className="flex h-14 w-14 items-center justify-center rounded-full transition-all hover:scale-105"
                style={{
                  background: webrtc.isMuted ? 'rgba(186,43,76,0.1)' : 'var(--surface-muted)',
                  border: `1.5px solid ${webrtc.isMuted ? 'var(--danger)' : 'var(--border)'}`,
                }}
              >
                {webrtc.isMuted
                  ? <MicOff className="h-6 w-6" style={{ color: 'var(--danger)' }} />
                  : <Mic className="h-6 w-6" style={{ color: 'var(--ink)' }} />
                }
              </button>

              <button
                disabled={endSession.isPending || endSession.isConfirming}
                onClick={() => { void handleEndSession() }}
                className="flex h-16 w-16 items-center justify-center rounded-full transition-all hover:scale-105 disabled:opacity-40"
                style={{ background: 'var(--danger)' }}
              >
                {endSession.isPending || endSession.isConfirming
                  ? <Loader2 className="h-7 w-7 animate-spin text-white" />
                  : <PhoneOff className="h-7 w-7 text-white" />
                }
              </button>
            </div>

            <p className="text-xs text-center mt-4" style={{ color: 'var(--muted)' }}>
              {t.endCallNote}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Pending / ExpertReady ────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-md mx-auto px-4 py-6">
      <div
        className="rounded-3xl p-6"
        style={{
          background: 'var(--surface-strong)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 24px rgba(18,45,69,0.08)',
        }}
      >
        {/* Session info */}
        <div className="mb-5 pb-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--muted)' }}>{t.sessionLabel} #{sessionId.toString()}</p>
          <div className="flex justify-between text-sm mb-1.5">
            <span style={{ color: 'var(--muted)' }}>{t.userLabel}</span>
            <span className="mono" style={{ color: 'var(--ink)' }}>{shortUser}</span>
          </div>
          <div className="flex justify-between text-sm mb-1.5">
            <span style={{ color: 'var(--muted)' }}>{t.expertLabel}</span>
            <span className="mono" style={{ color: 'var(--ink)' }}>{shortExpert}</span>
          </div>
          <div className="flex justify-between text-sm mb-1.5">
            <span style={{ color: 'var(--muted)' }}>{t.bookedDuration}</span>
            <span className="tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>{bookedDisplay}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--muted)' }}>{t.lockedAmount}</span>
            <span className="tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>{totalDisplay} USDC</span>
          </div>
        </div>

        {/* Status flow */}
        {status === SessionStatus.Pending && isExpert && (
          <div>
            <div className="flex items-start gap-3 rounded-2xl p-3 mb-4" style={{ background: 'rgba(18,45,69,0.04)' }}>
              <Clock className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{t.expertPendingMsg}</p>
            </div>
            <button
              disabled={accept.isPending || accept.isConfirming}
              onClick={() => { void handleAccept() }}
              className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {accept.isPending || accept.isConfirming ? (
                <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t.confirming}</span>
              ) : t.acceptRequest}
            </button>
          </div>
        )}

        {status === SessionStatus.Pending && isUser && (
          <div>
            <div className="flex items-start gap-3 rounded-2xl p-3 mb-4" style={{ background: 'rgba(18,45,69,0.04)' }}>
              <Clock className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{t.waitingExpert}</p>
            </div>
            <button
              disabled={cancel.isPending || cancel.isConfirming}
              onClick={() => { void handleCancel() }}
              className="w-full rounded-2xl py-3 text-sm font-semibold transition-all"
              style={{ background: 'var(--surface-muted)', color: 'var(--danger)', border: '1.5px solid rgba(186,43,76,0.3)' }}
            >
              {cancel.isPending || cancel.isConfirming ? t.cancelling : t.cancelRequest}
            </button>
          </div>
        )}

        {status === SessionStatus.ExpertReady && isUser && (
          <div>
            <div className="flex items-start gap-3 rounded-2xl p-3 mb-4" style={{ background: 'rgba(26,128,71,0.06)', border: '1px solid rgba(26,128,71,0.2)' }}>
              <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
              <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{t.expertReadyMsg}</p>
            </div>
            <button
              disabled={confirmStart.isPending || confirmStart.isConfirming}
              onClick={() => { void handleConfirmStart() }}
              className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] disabled:opacity-40 mb-3"
              style={{ background: 'var(--success)' }}
            >
              {confirmStart.isPending || confirmStart.isConfirming ? (
                <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t.confirming}</span>
              ) : t.confirmStart}
            </button>
            <button
              disabled={cancel.isPending || cancel.isConfirming}
              onClick={() => { void handleCancel() }}
              className="w-full rounded-2xl py-2.5 text-sm font-medium"
              style={{ background: 'transparent', color: 'var(--muted)' }}
            >
              {t.cancelFull}
            </button>
          </div>
        )}

        {status === SessionStatus.ExpertReady && isExpert && (
          <div className="flex items-start gap-3 rounded-2xl p-3" style={{ background: 'rgba(26,128,71,0.06)' }}>
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{t.expertWaitingUser}</p>
          </div>
        )}

        {!isUser && !isExpert && (
          <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>{t.notParticipant}</p>
        )}
      </div>
    </div>
  )
}
