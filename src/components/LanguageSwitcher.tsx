'use client'

import { useRouter } from 'next/navigation'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { Locale } from '@/i18n/locales'

const FLAGS: Record<Locale, string> = {
  es: '🇪🇸',
  en: '🇬🇧',
}

const LABELS: Record<Locale, string> = {
  es: 'ES',
  en: 'EN',
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter()
  const { locale, setLocale } = useI18n()

  const next: Locale = locale === 'es' ? 'en' : 'es'
  const switchLabel =
    locale === 'es'
      ? `Cambiar idioma a ${next === 'en' ? 'English' : 'Español'}`
      : `Switch language to ${next === 'en' ? 'English' : 'Español'}`

  return (
    <button
      type="button"
      onClick={() => {
        setLocale(next)
        router.refresh()
      }}
      title={switchLabel}
      aria-label={switchLabel}
      className={cn(
        'flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-[var(--muted)]',
        'hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
        'border border-transparent hover:border-[var(--border)] focus-visible:border-[var(--border)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
        className
      )}
    >
      <span aria-hidden="true">{FLAGS[locale]}</span>
      <span>{LABELS[locale]}</span>
    </button>
  )
}
