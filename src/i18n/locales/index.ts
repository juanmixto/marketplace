import es from './es'
import en from './en'
import type { TranslationKeys } from './es'

export type Locale = 'es' | 'en'

export const locales: Record<Locale, Record<TranslationKeys, string>> = { es, en }

export const defaultLocale: Locale = 'es'
