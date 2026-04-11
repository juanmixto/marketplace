'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { defaultLocale, locales } from './locales'
import type { Locale, TranslationKeys } from './locales'
export type { TranslationKeys } from './locales'

const STORAGE_KEYS = ['mp_locale', 'locale'] as const

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKeys) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function readStoredLocale(): Locale | null {
  if (typeof window === 'undefined') {
    return null
  }

  for (const key of STORAGE_KEYS) {
    const stored = localStorage.getItem(key)
    if (stored === 'es' || stored === 'en') {
      return stored
    }
  }

  return null
}

function persistLocale(next: Locale) {
  for (const key of STORAGE_KEYS) {
    localStorage.setItem(key, next)
  }

  document.documentElement.lang = next
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale)

  useEffect(() => {
    const stored = readStoredLocale()
    if (stored) {
      setLocaleState(stored)
      document.documentElement.lang = stored
    }
  }, [])

  const setLocale = (next: Locale) => {
    setLocaleState(next)
    persistLocale(next)
  }

  const t = (key: TranslationKeys): string => locales[locale][key] ?? locales[defaultLocale][key] ?? key

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>
}

export const I18nProvider = LanguageProvider

export function useLocale(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useLocale must be used inside <LanguageProvider>')
  return ctx
}

export const useI18n = useLocale

export function useT(): (key: TranslationKeys) => string {
  return useLocale().t
}
