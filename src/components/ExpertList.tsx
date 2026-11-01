import { Users, Loader2, RefreshCw } from 'lucide-react'
import { useAllExpertAddresses, useExpert, type Expert } from '@/hooks/useVoiceConsult'
import { useAccount } from 'wagmi'
import { ExpertCard } from './ExpertCard'
import { useLocale } from '@/hooks/useLocale'

interface Props {
  onBook: (expert: Expert) => void
  onRegister: () => void
  onViewProfile: (address: string) => void
  onViewSlots: (expert: Expert) => void
}

function ExpertRow({
  address,
  onBook,
  onViewProfile,
  onViewSlots,
  currentUser,
}: {
  address: string
  onBook: (e: Expert) => void
  onViewProfile: (addr: string) => void
  onViewSlots: (e: Expert) => void
  currentUser?: string
}) {
  const { data: expert, isLoading } = useExpert(address)

  if (isLoading) {
    return (
      <div className="rounded-3xl p-5 animate-pulse" style={{ background: 'var(--surface-muted)', height: '172px' }} />
    )
  }
  const e = expert as Expert | undefined
  if (!e || e.addr === '0x0000000000000000000000000000000000000000') return null
  return (
    <ExpertCard
      expert={e}
      onBook={onBook}
      onViewProfile={onViewProfile}
      onViewSlots={onViewSlots}
      isCurrentUser={currentUser?.toLowerCase() === address.toLowerCase()}
    />
  )
}

export function ExpertList({ onBook, onRegister, onViewProfile, onViewSlots }: Props) {
  const { data: addresses, isLoading, refetch } = useAllExpertAddresses()
  const { address: currentUser } = useAccount()
  const { t } = useLocale()

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            {t.expertMarket}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            {t.expertMarketDesc}
          </p>
        </div>
        <button
          onClick={() => { void refetch() }}
          className="flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-medium transition-all hover:scale-[1.02]"
          style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t.refresh}
        </button>
      </div>

      {/* Register CTA */}
      <div
        className="rounded-3xl p-4 mb-6 flex items-center justify-between"
        style={{ background: 'rgba(18,45,69,0.04)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'var(--accent)' }}>
            <Users className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t.becomeExpert}</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.becomeExpertDesc}</p>
          </div>
        </div>
        <button
          onClick={onRegister}
          className="rounded-2xl px-4 py-2 text-xs font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          {t.registerNow}
        </button>
      </div>

      {/* Expert grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--subtle)' }} />
        </div>
      ) : !addresses || (addresses as string[]).length === 0 ? (
        <div className="text-center py-16">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-3xl mb-4" style={{ background: 'var(--surface-muted)' }}>
            <Users className="h-8 w-8" style={{ color: 'var(--subtle)' }} />
          </div>
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>{t.noExperts}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{t.noExpertsDesc}</p>
          <button
            onClick={onRegister}
            className="mt-4 rounded-2xl px-6 py-2.5 text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}
          >
            {t.beFirstExpert}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(addresses as string[]).map(addr => (
            <ExpertRow
              key={addr}
              address={addr}
              onBook={onBook}
              onViewProfile={onViewProfile}
              onViewSlots={onViewSlots}
              currentUser={currentUser}
            />
          ))}
        </div>
      )}
    </div>
  )
}
