'use client'

import { useRouter } from 'next/navigation'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { Locale } from '@/i18n/locales'

const LOCALES: ReadonlyArray<{ code: Locale; label: string; full: string }> = [
  { code: 'es', label: 'ES', full: 'Español' },
  { code: 'en', label: 'EN', full: 'English' },
]

/**
 * Segmented two-option toggle so the current locale and the alternative
 * are both visible — the previous single-button "next locale" design
 * was ambiguous (clicking `EN` read as "switch to English" to some users
 * and "you are in English" to others, and the flag emoji fell back to
 * plain `ES` letters on some Android builds producing a spooky `ES ES`).
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter()
  const { locale, setLocale } = useI18n()

  function handleSelect(next: Locale) {
    if (next === locale) return
    setLocale(next)
    router.refresh()
  }

  return (
    <div
      role="group"
      aria-label={locale === 'es' ? 'Seleccionar idioma' : 'Select language'}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-0.5',
        className
      )}
    >
      {LOCALES.map(({ code, label, full }) => {
        const active = code === locale
        return (
          <button
            key={code}
            type="button"
            onClick={() => handleSelect(code)}
            aria-pressed={active}
            title={full}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30',
              active
                ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-gray-950'
                : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
