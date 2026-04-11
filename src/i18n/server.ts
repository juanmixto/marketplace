import { cookies } from 'next/headers'
import { defaultLocale } from './locales'
import type { Locale } from './locales'

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
