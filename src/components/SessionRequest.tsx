import { useState } from 'react'
import { ArrowLeft, Clock, Loader2, CheckCircle, AlertCircle, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import {
  useRequestSessionWithPermit, useUsdcBalance,
  computeSessionCost, formatUsdcAmount, type Expert
} from '@/hooks/useVoiceConsult'
import { useAccount } from 'wagmi'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { arcTestnet } from 'viem/chains'
import { useLocale } from '@/hooks/useLocale'

interface Props {
  expert: Expert
  onBack: () => void
  onSessionCreated: (sessionId: bigint) => void
}

const DURATION_OPTIONS = [
  { labelKey: 'dur15', value: 15 * 60 },
  { labelKey: 'dur30', value: 30 * 60 },
  { labelKey: 'dur60', value: 60 * 60 },
] as const

export function SessionRequest({ expert, onBack, onSessionCreated }: Props) {
  const { address } = useAccount()
  const { t } = useLocale()
  const [duration, setDuration] = useState(DURATION_OPTIONS[1].value)

  const cost = computeSessionCost(expert.ratePerMinute, duration)
  const costDisplay = formatUsdcAmount(cost)

  const { data: balance } = useUsdcBalance(address)
  const { requestWithPermit, isSigning, isPending, isConfirming, isSuccess, hash } = useRequestSessionWithPermit()

  const balanceFmt = balance !== undefined ? formatUsdcAmount(balance) : '...'
  const insufficientBalance = balance !== undefined && (balance) < cost

  async function handleRequest() {
    try {
      await requestWithPermit(expert.addr, duration, cost)
      toast.success(t.requestSubmitted)
      onSessionCreated(0n)
    } catch (err) {
      toast.error((err as Error).message?.slice(0, 80) ?? t.requestFailed)
    }
  }

  // Success screen
  if (isSuccess && hash) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-6">
        <div
          className="rounded-3xl p-6 text-center"
          style={{
            background: 'var(--surface-strong)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 24px rgba(18,45,69,0.08)',
          }}
        >
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-3xl mb-4" style={{ background: 'rgba(26,128,71,0.10)' }}>
            <CheckCircle className="h-8 w-8" style={{ color: 'var(--success)' }} />
          </div>
          <h3 className="display text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>{t.requestSuccessTitle}</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
            {t.requestSuccessDesc(costDisplay, expert.name)}
          </p>
          <a
            href={buildTxExplorerUrl(arcTestnet.id, hash)}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium underline underline-offset-2 mb-6 block"
            style={{ color: 'var(--accent-hover)' }}
          >
            {t.viewOnExplorer}
          </a>
          <button
            onClick={() => onSessionCreated(0n)}
            className="w-full rounded-2xl py-3 text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}
          >
            {t.viewMySessions}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6">
      <button onClick={onBack} className="flex items-center gap-1.5 mb-6 text-sm font-medium" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="h-4 w-4" />
        {t.backToMarket2}
      </button>

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
        {/* Expert info */}
        <div className="flex items-center gap-3 mb-6 pb-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-white font-semibold text-lg"
            style={{ background: 'var(--accent)' }}
          >
            {expert.name ? expert.name[0].toUpperCase() : '?'}
          </div>
          <div>
            <p className="display font-semibold" style={{ color: 'var(--ink)' }}>{expert.name || t.unnamed}</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {formatUsdcAmount(expert.ratePerMinute)} USDC{t.perMin}
              {expert.minimumFee > 0n && (
                <span style={{ color: 'var(--accent-hover)' }}> · {t.minFee} {formatUsdcAmount(expert.minimumFee)} USDC</span>
              )}
            </p>
          </div>
        </div>

        {/* Duration selection */}
        <p className="text-xs font-semibold mb-2.5" style={{ color: 'var(--ink-2)' }}>{t.selectDuration}</p>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {DURATION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDuration(opt.value)}
              className="rounded-2xl py-2.5 text-sm font-semibold transition-all"
              style={{
                background: duration === opt.value ? 'var(--accent)' : 'var(--surface-muted)',
                color: duration === opt.value ? '#fff' : 'var(--ink-2)',
                border: duration === opt.value ? 'none' : '1px solid var(--border)',
              }}
            >
              {t[opt.labelKey]}
            </button>
          ))}
        </div>

        {/* Cost preview */}
        <div className="rounded-2xl p-4 mb-5" style={{ background: 'var(--surface-muted)' }}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.consultFee}</span>
            <span className="display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {costDisplay} <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.yourBalance}</span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: insufficientBalance ? 'var(--danger)' : 'var(--success)' }}>
              {balanceFmt} USDC
            </span>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>{t.refundNote}</p>
        </div>

        {insufficientBalance && (
          <div className="flex items-start gap-2 rounded-2xl p-3 mb-4" style={{ background: 'rgba(186,43,76,0.08)' }}>
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
            <p className="text-xs" style={{ color: 'var(--danger)' }}>{t.insufficientBalance}</p>
          </div>
        )}

        {/* How it works — one-liner for first-timers */}
        {!insufficientBalance && (
          <div className="flex items-start gap-2 rounded-2xl p-3 mb-4" style={{ background: 'rgba(18,45,69,0.04)', border: '1px solid var(--border)' }}>
            <PenLine className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
            <p className="text-xs" style={{ color: 'var(--ink-2)' }}>{t.permitNote}</p>
          </div>
        )}

        {/* Single action button */}
        <button
          disabled={isSigning || isPending || isConfirming || insufficientBalance}
          onClick={() => { void handleRequest() }}
          className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {isSigning ? (
            <span className="flex items-center justify-center gap-2">
              <PenLine className="h-4 w-4" />
              {t.signingPermit}
            </span>
          ) : isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t.confirmingWallet}
            </span>
          ) : isConfirming ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t.onchainConfirming}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Clock className="h-4 w-4" />
              {t.lockRequest}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
