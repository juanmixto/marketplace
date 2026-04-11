'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useLocale } from '@/i18n'

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          'h-9 w-9 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]',
          className
        )}
      />
    )
  }

  const next = locale === 'es' ? 'en' : 'es'

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      title={`Switch to ${next.toUpperCase()}`}
      aria-label={`Switch language. Current: ${locale.toUpperCase()}. Next: ${next.toUpperCase()}`}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)]',
        'hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
        'border border-transparent hover:border-[var(--border)] focus-visible:border-[var(--border)]',
        'text-xs font-semibold',
        className
      )}
    >
      {locale.toUpperCase()}
    </button>
  )
}
