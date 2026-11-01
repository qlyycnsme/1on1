import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { LayoutGrid, Clock, UserCircle } from 'lucide-react'

import { ChainGuard } from '@/components/ChainGuard'
import { ExpertList } from '@/components/ExpertList'
import { RegisterExpert } from '@/components/RegisterExpert'
import { SessionRequest } from '@/components/SessionRequest'
import { CallRoom } from '@/components/CallRoom'
import { SessionHistory } from '@/components/SessionHistory'
import { ProfilePage } from '@/components/ProfilePage'
import { ScheduleManager } from '@/components/ScheduleManager'
import { SlotPicker } from '@/components/SlotPicker'
import { useLocale } from '@/hooks/useLocale'
import type { Expert } from '@/hooks/useVoiceConsult'

type View =
  | { name: 'market' }
  | { name: 'register' }
  | { name: 'request'; expert: Expert }
  | { name: 'slots'; expert: Expert }
  | { name: 'call'; sessionId: bigint }
  | { name: 'history' }
  | { name: 'schedule' }
  | { name: 'profile'; address?: string }   // own profile if address omitted

export default function App() {
  const { isConnected, address } = useAccount()
  const [view, setView] = useState<View>({ name: 'market' })
  const { locale, t, toggle } = useLocale()

  const navItems = [
    { id: 'market',  label: t.navMarket,  Icon: LayoutGrid  },
    { id: 'history', label: t.navHistory, Icon: Clock       },
    { id: 'profile', label: t.navProfile, Icon: UserCircle  },
  ] as const

  function renderView() {
    switch (view.name) {
      case 'market':
        return (
          <ExpertList
            onBook={expert => setView({ name: 'request', expert })}
            onRegister={() => setView({ name: 'register' })}
            onViewProfile={addr => setView({ name: 'profile', address: addr })}
            onViewSlots={expert => setView({ name: 'slots', expert })}
          />
        )
      case 'register':
        return (
          <RegisterExpert
            onBack={() => setView({ name: 'market' })}
            onSuccess={() => setView({ name: 'schedule' })}
            onManageSchedule={() => setView({ name: 'schedule' })}
          />
        )
      case 'request':
        return (
          <SessionRequest
            expert={view.expert}
            onBack={() => setView({ name: 'market' })}
            onSessionCreated={() => setView({ name: 'history' })}
          />
        )
      case 'call':
        return (
          <CallRoom
            sessionId={view.sessionId}
            onBack={() => setView({ name: 'history' })}
          />
        )
      case 'history':
        return (
          <SessionHistory
            onViewSession={id => setView({ name: 'call', sessionId: id })}
          />
        )
      case 'schedule':
        return (
          <ScheduleManager
            onBack={() => setView({ name: 'market' })}
          />
        )
      case 'slots':
        return (
          <SlotPicker
            expert={view.expert}
            onBack={() => setView({ name: 'market' })}
            onSessionStarted={() => setView({ name: 'history' })}
          />
        )
      case 'profile':
        return (
          <ProfilePage
            targetAddr={view.address}
            onBack={() => setView({ name: 'market' })}
            onViewSession={id => setView({ name: 'call', sessionId: id })}
            onManageSchedule={() => setView({ name: 'schedule' })}
          />
        )
    }
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg-gradient)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 py-3"
        style={{
          background: 'var(--surface)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button
          className="flex items-center gap-2"
          onClick={() => setView({ name: 'market' })}
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{ background: 'var(--accent)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="white" />
            </svg>
          </div>
          <span className="display font-bold text-base" style={{ color: 'var(--ink)' }}>VoiceConsult</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Language toggle */}
          <button
            onClick={toggle}
            className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all hover:scale-[1.04]"
            style={{
              background: 'var(--surface-muted)',
              border: '1px solid var(--border)',
              color: 'var(--ink-2)',
              letterSpacing: '0.02em',
            }}
            aria-label="Toggle language"
          >
            <span style={{ opacity: locale === 'en' ? 1 : 0.4 }}>EN</span>
            <span style={{ color: 'var(--subtle)' }}>/</span>
            <span style={{ opacity: locale === 'zh' ? 1 : 0.4 }}>中文</span>
          </button>

          {/* Own profile avatar shortcut */}
          {isConnected && (
            <button
              onClick={() => setView({ name: 'profile' })}
              className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden transition-all hover:scale-110"
              style={{ background: 'var(--accent)', border: '2px solid var(--border)' }}
              aria-label="My profile"
            >
              <UserCircle className="h-4 w-4 text-white" />
            </button>
          )}

          <ConnectKitButton />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pb-24">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-80px)] px-6 text-center">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
              style={{ background: 'var(--accent)' }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="white" />
              </svg>
            </div>
            <h1 className="display text-3xl font-bold mb-3" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
              VoiceConsult
            </h1>
            <p className="text-sm max-w-xs mb-2" style={{ color: 'var(--ink-2)' }}>
              {t.appTagline}
            </p>
            <p className="text-sm max-w-xs mb-8" style={{ color: 'var(--muted)' }}>
              {t.appDesc}
            </p>
            <div className="flex flex-col gap-2 text-sm w-full max-w-xs mb-8">
              {[t.feature1, t.feature2, t.feature3, t.feature4].map(item => (
                <div key={item} className="flex items-center gap-2 text-left">
                  <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                  <span style={{ color: 'var(--ink-2)' }}>{item}</span>
                </div>
              ))}
            </div>
            <ConnectKitButton />
          </div>
        ) : (
          <ChainGuard>
            {renderView()}
          </ChainGuard>
        )}
      </main>

      {/* Bottom nav — only when connected */}
      {isConnected && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around py-3 px-4"
          style={{
            background: 'var(--surface)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderTop: '1px solid var(--border)',
          }}
        >
          {navItems.map(({ id, label, Icon }) => {
            const active = view.name === id ||
              (id === 'profile' && view.name === 'profile' && !view.address) ||
              (id === 'profile' && view.name === 'profile' && view.address?.toLowerCase() === address?.toLowerCase())
            return (
              <button
                key={id}
                onClick={() => setView(id === 'profile' ? { name: 'profile' } : { name: id } as View)}
                className="flex flex-col items-center gap-1 min-w-[60px] py-1 transition-all"
              >
                <Icon
                  className="h-5 w-5"
                  style={{ color: active ? 'var(--accent)' : 'var(--subtle)' }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: active ? 'var(--accent)' : 'var(--subtle)' }}
                >
                  {label}
                </span>
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}
