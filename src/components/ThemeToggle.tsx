'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className={cn('h-9 w-9 rounded-lg', className)} />
  }

  const isDark = resolvedTheme === 'dark'

  const cycle = () => {
    if (theme === 'system') setTheme('light')
    else if (theme === 'light') setTheme('dark')
    else setTheme('system')
  }

  const Icon = theme === 'system' ? ComputerDesktopIcon : isDark ? MoonIcon : SunIcon
  const label = theme === 'system' ? 'Automático' : isDark ? 'Oscuro' : 'Claro'

  return (
    <button
      onClick={cycle}
      title={`Tema: ${label}`}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)]',
        'hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
        'border border-transparent hover:border-[var(--border)]',
        className
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="sr-only">Cambiar tema ({label})</span>
    </button>
  )
}
