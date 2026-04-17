'use client'

import type { ReactNode } from 'react'

interface UploadTriggerProps {
  title: string
  subtitle: string
  icon: ReactNode
  disabled?: boolean
  onClick: () => void
}

export function UploadTrigger({
  title,
  subtitle,
  icon,
  disabled = false,
  onClick,
}: UploadTriggerProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-24 w-full items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-left transition ${
        disabled
          ? 'cursor-not-allowed border-[var(--border)] bg-[var(--surface-raised)] opacity-60'
          : 'border-[var(--border)] bg-[var(--surface-raised)] hover:border-emerald-300 dark:hover:border-emerald-700'
      }`}
    >
      <span className="shrink-0 text-emerald-600 dark:text-emerald-400">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--foreground)]">{title}</span>
        <span className="block text-xs text-[var(--muted)]">{subtitle}</span>
      </span>
    </button>
  )
}
