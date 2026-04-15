'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Option {
  value: string
  label: string
}

interface Props {
  name: string
  defaultValue: string
  options: Option[]
  allLabel?: string
}

const TONE_BY_VALUE: Record<string, string> = {
  all: 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]',
  DRAFT: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200',
  PENDING_REVIEW: 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  ACTIVE: 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  REJECTED: 'border-red-300 bg-red-100 text-red-800 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200',
  SUSPENDED: 'border-red-300 bg-red-100 text-red-800 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200',
}

export function ProductStatusFilterSelect({ name, defaultValue, options, allLabel = 'Todos' }: Props) {
  const [value, setValue] = useState(defaultValue)
  const tone = TONE_BY_VALUE[value] ?? TONE_BY_VALUE.all

  return (
    <select
      name={name}
      value={value}
      onChange={e => setValue(e.target.value)}
      className={cn(
        'h-10 w-full rounded-full border px-3 text-sm font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30',
        tone,
      )}
    >
      <option value="all">{allLabel}</option>
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
