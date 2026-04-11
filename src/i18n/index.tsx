'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { locales, defaultLocale } from './locales'
import type { Locale } from './locales'
import type { TranslationKeys } from './locales/es'

const STORAGE_KEY = 'mp_locale'

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKeys) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
    if (stored && stored in locales) {
      setLocaleState(stored)
      document.documentElement.lang = stored
    }
  }, [])

  const setLocale = (next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(STORAGE_KEY, next)
    document.documentElement.lang = next
  }

  const t = (key: TranslationKeys): string => locales[locale][key]

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}

/** Convenience hook — returns the translation function directly. */
export function useT(): (key: TranslationKeys) => string {
  return useI18n().t
}
