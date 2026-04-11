import { cookies } from 'next/headers'
import { defaultLocale, locales } from './locales'
import type { Locale, TranslationKeys } from './locales'

export const LOCALE_COOKIE_KEYS = ['mp_locale', 'locale'] as const

export function coerceLocale(value: string | null | undefined): Locale {
  return value === 'en' || value === 'es' ? value : defaultLocale
}

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies()

  for (const key of LOCALE_COOKIE_KEYS) {
    const value = cookieStore.get(key)?.value
    if (value === 'en' || value === 'es') {
      return value
    }
  }

  return defaultLocale
}

export async function getServerT() {
  const locale = await getServerLocale()
  return (key: TranslationKeys): string =>
    locales[locale][key] ?? locales[defaultLocale][key] ?? key
}
