import { useState } from 'react'
import { ArrowLeft, UserPlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRegisterExpert, useExpert } from '@/hooks/useVoiceConsult'
import { useAccount } from 'wagmi'
import { parseUnits } from 'viem'
import { useLocale } from '@/hooks/useLocale'

interface Props {
  onBack: () => void
  onSuccess: () => void
  onManageSchedule?: () => void
}

export function RegisterExpert({ onBack, onSuccess, onManageSchedule }: Props) {
  const { address } = useAccount()
  const { data: existing } = useExpert(address)
  const { register, isPending, isConfirming, error } = useRegisterExpert()
  const { t } = useLocale()

  const ex = existing as { name?: string; bio?: string; ratePerMinute?: bigint; minimumFee?: bigint; addr?: string } | undefined

  const [name, setName] = useState(ex?.name ?? '')
  const [bio, setBio] = useState(ex?.bio ?? '')
  const [rateStr, setRateStr] = useState(
    ex?.ratePerMinute ? (Number(ex.ratePerMinute) / 1e6).toFixed(6) : '0.5'
  )
  const [minFeeStr, setMinFeeStr] = useState(
    ex?.minimumFee && ex.minimumFee > 0n ? (Number(ex.minimumFee) / 1e6).toFixed(6) : '0'
  )

  const isEditing = ex?.addr !== undefined && ex.addr !== '0x0000000000000000000000000000000000000000' && ex.ratePerMinute !== 0n

  function safeParse(str: string): bigint {
    try { return parseUnits(parseFloat(str).toFixed(6), 6) } catch { return 0n }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!address) return
    const rate = safeParse(rateStr)
    if (rate === 0n) { toast.error(t.rateZeroError); return }
    const minFee = safeParse(minFeeStr)
    try {
      await register(rate, minFee, name.trim(), bio.trim())
      toast.success(isEditing ? t.updateSuccess : t.registerSuccess)
      onSuccess()
    } catch (err) {
      toast.error((err as Error).message?.slice(0, 80) ?? t.operationFailed)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1.5 mb-6 text-sm font-medium" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="h-4 w-4" />
        {t.backToMarket}
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
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: 'var(--accent)' }}>
            <UserPlus className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
              {isEditing ? t.updateTitle : t.registerTitle}
            </h2>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.registerSubtitle}</p>
          </div>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>
              {t.displayName}
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              maxLength={50}
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none transition-all"
              style={{
                background: 'var(--surface-muted)',
                border: '1.5px solid transparent',
                color: 'var(--ink)',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--focus)')}
              onBlur={e => (e.target.style.borderColor = 'transparent')}
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>
              {t.bio}
            </label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder={t.bioPlaceholder}
              maxLength={200}
              rows={3}
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none transition-all"
              style={{
                background: 'var(--surface-muted)',
                border: '1.5px solid transparent',
                color: 'var(--ink)',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--focus)')}
              onBlur={e => (e.target.style.borderColor = 'transparent')}
            />
          </div>

          {/* Rate */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>
              {t.rateLabel}
            </label>
            <div className="relative">
              <input
                type="number"
                value={rateStr}
                onChange={e => setRateStr(e.target.value)}
                min="0.000001"
                step="any"
                placeholder="0.50"
                className="display w-full rounded-2xl px-4 py-3 text-2xl font-bold tabular-nums outline-none transition-all"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1.5px solid transparent',
                  color: 'var(--ink)',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--focus)')}
                onBlur={e => (e.target.style.borderColor = 'transparent')}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--subtle)' }}>
                USDC/min
              </span>
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
              {t.rateSuggestion}
            </p>
          </div>

          {/* Minimum fee */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>
              {t.minFeeLabel}
            </label>
            <div className="relative">
              <input
                type="number"
                value={minFeeStr}
                onChange={e => setMinFeeStr(e.target.value)}
                min="0"
                step="any"
                placeholder="0"
                className="display w-full rounded-2xl px-4 py-3 text-2xl font-bold tabular-nums outline-none transition-all"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1.5px solid transparent',
                  color: 'var(--ink)',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--focus)')}
                onBlur={e => (e.target.style.borderColor = 'transparent')}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--subtle)' }}>
                USDC
              </span>
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
              {t.minFeeHint}
            </p>
          </div>

          {/* Preview */}
          <div className="rounded-2xl p-3 space-y-1.5" style={{ background: 'var(--surface-muted)' }}>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.preview30}</span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                {(parseFloat(rateStr || '0') * 30).toFixed(2)} USDC
              </span>
            </div>
            {parseFloat(minFeeStr || '0') > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.minFeePreview}</span>
                <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--accent-hover)' }}>
                  ≥ {parseFloat(minFeeStr || '0').toFixed(2)} USDC
                </span>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending || isConfirming || !rateStr}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.confirmingWallet}
              </span>
            ) : isConfirming ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.onchainConfirming}
              </span>
            ) : isEditing ? t.updateProfile : t.registerBtn}
          </button>

          {error && (
            <p className="text-xs text-center" style={{ color: 'var(--danger)' }}>
              {(error as Error).message?.slice(0, 100) ?? t.operationFailed}
            </p>
          )}

          {onManageSchedule && (
            <button
              type="button"
              onClick={onManageSchedule}
              className="w-full rounded-2xl py-3 text-sm font-semibold transition-all hover:scale-[1.01]"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
            >
              📅 {t.scheduleTitle}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
