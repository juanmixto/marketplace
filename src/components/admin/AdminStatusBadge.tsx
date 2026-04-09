import { cn } from '@/lib/utils'

interface Props {
  label: string
  tone: 'amber' | 'blue' | 'emerald' | 'red' | 'slate'
}

const TONE_CLASSES: Record<Props['tone'], string> = {
  amber: 'border-amber-200 bg-amber-50 text-amber-800 ring-amber-200/70 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/60',
  blue: 'border-blue-200 bg-blue-50 text-blue-800 ring-blue-200/70 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/60',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 ring-emerald-200/70 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/60',
  red: 'border-red-200 bg-red-50 text-red-800 ring-red-200/70 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800/60',
  slate: 'border-slate-200 bg-slate-50 text-slate-700 ring-slate-200/70 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:ring-slate-700/60',
}

export function AdminStatusBadge({ label, tone }: Props) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        TONE_CLASSES[tone]
      )}
    >
      {label}
    </span>
  )
}
