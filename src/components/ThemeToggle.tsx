'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import {
  getNextThemePreference,
  getThemeToggleLabel,
  isDarkThemeSelected,
  normalizeThemePreference,
} from '@/lib/theme'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
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

  const currentTheme = normalizeThemePreference(theme)
  const isDark = isDarkThemeSelected(theme, resolvedTheme)
  const nextTheme = getNextThemePreference(theme)
  const label = getThemeToggleLabel(theme, resolvedTheme)

  const Icon = currentTheme === 'system' ? ComputerDesktopIcon : isDark ? MoonIcon : SunIcon

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      title={`Tema: ${label}`}
      aria-label={`Cambiar tema. Actual: ${label}. Siguiente: ${nextTheme}`}
      aria-pressed={isDark}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)]',
        'hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
        'border border-transparent hover:border-[var(--border)] focus-visible:border-[var(--border)]',
        className
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="sr-only">Cambiar tema ({label})</span>
    </button>
  )
}
