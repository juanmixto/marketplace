'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import es from './locales/es'
import en from './locales/en'

export type Locale = 'es' | 'en'

const STORAGE_KEY = 'locale'
const DEFAULT_LOCALE: Locale = 'es'

const dictionaries: Record<Locale, Record<string, string>> = { es, en }

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'es') {
      setLocaleState(stored)
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
  return function t(key: string): string {
    return dict[key] ?? key
  }
}
