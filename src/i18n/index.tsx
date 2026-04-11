'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { es, en } from './locales'
import type { TranslationKeys } from './locales'

export type Locale = 'es' | 'en'
export type { TranslationKeys }

const STORAGE_KEY = 'locale'
const DEFAULT_LOCALE: Locale = 'es'

// To add a new locale: create src/i18n/locales/fr.ts (must satisfy
// Record<TranslationKeys, string>), export it from locales/index.ts,
// add the key here and to the Locale union type above.
const dictionaries: Record<Locale, Record<TranslationKeys, string>> = { es, en }

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Start with DEFAULT_LOCALE so server and initial client render match (avoids
  // hydration mismatch). After mount we read localStorage and update if needed.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'es') {
      setLocaleState(stored as Locale)
    }
  }, [])

  function setLocale(next: Locale) {
    localStorage.setItem(STORAGE_KEY, next)
    setLocaleState(next)
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}

export function useT() {
  const { locale } = useLocale()
  const dict = dictionaries[locale]
  return function t(key: TranslationKeys): string {
    return dict[key]
  }
}
