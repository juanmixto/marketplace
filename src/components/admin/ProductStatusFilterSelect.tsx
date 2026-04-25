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
  all: 'border-[var(--border)] text-[var(--foreground)]',
  DRAFT: 'border-slate-400 text-slate-700 dark:border-slate-500 dark:text-slate-200',
  PENDING_REVIEW: 'border-amber-400 text-amber-800 dark:border-amber-500 dark:text-amber-300',
  ACTIVE: 'border-emerald-400 text-emerald-800 dark:border-emerald-500 dark:text-emerald-300',
  REJECTED: 'border-red-400 text-red-800 dark:border-red-500 dark:text-red-300',
  SUSPENDED: 'border-red-400 text-red-800 dark:border-red-500 dark:text-red-300',
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
        'h-10 w-full rounded-full border-2 bg-[var(--surface)] px-3 text-sm font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30',
        tone,
      )}
    >
      <option value="all" className="bg-[var(--surface)] text-[var(--foreground)]">{allLabel}</option>
      {options.map(option => (
        <option key={option.value} value={option.value} className="bg-[var(--surface)] text-[var(--foreground)]">
          {option.label}
        </option>
      ))}
    </select>
  )
}
