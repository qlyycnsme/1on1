import { useAccount, useSwitchChain } from 'wagmi'
import { arc } from 'viem/chains'
import { AlertCircle } from 'lucide-react'
import { useLocale } from '@/hooks/useLocale'

interface Props {
  children: React.ReactNode
}

export function ChainGuard({ children }: Props) {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  const { t } = useLocale()

  if (!isConnected) return <>{children}</>

  if (chainId !== arc.id) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(18,45,69,0.7)', backdropFilter: 'blur(8px)' }}>
        <div className="w-full max-w-sm rounded-3xl p-6 text-center" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          <div className="mb-3 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'rgba(186,43,76,0.1)' }}>
              <AlertCircle className="h-6 w-6" style={{ color: 'var(--danger)' }} />
            </div>
          </div>
          <h3 className="display text-lg font-semibold mb-1" style={{ color: 'var(--ink)' }}>{t.switchNetwork}</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>{t.switchNetworkDesc}</p>
          <button
            disabled={isPending}
            onClick={() => switchChain({ chainId: arc.id })}
            className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {isPending ? t.switching : t.switchNetwork}
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
