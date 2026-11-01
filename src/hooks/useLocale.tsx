import { createContext, useContext, useState, type ReactNode } from 'react'
import { translations, type Locale, type Translations } from '@/i18n'

interface LocaleContextValue {
  locale: Locale
  t: Translations
  toggle: () => void
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en')
  const toggle = () => setLocale(l => (l === 'en' ? 'zh' : 'en'))
  // Cast to Translations (the 'en' shape) — both locales are structurally identical.
  const t = translations[locale] as unknown as Translations
  return (
    <LocaleContext.Provider value={{ locale, t, toggle }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used inside LocaleProvider')
  return ctx
}
