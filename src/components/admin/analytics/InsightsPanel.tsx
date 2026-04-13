import type { Insight } from '@/domains/analytics/types'

interface Props {
  insights: Insight[]
}

const TONE_STYLES: Record<Insight['tone'], string> = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  neutral: 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]',
}

const TONE_ICON: Record<Insight['tone'], string> = {
  positive: '↑',
  warning: '!',
  neutral: '•',
}

export function InsightsPanel({ insights }: Props) {
  if (insights.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">
        Sin insights para este periodo.
      </div>
    )
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {insights.map(i => (
        <div key={i.id} className={`rounded-xl border p-3 ${TONE_STYLES[i.tone]}`}>
          <div className="flex items-start gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/60 text-sm font-bold dark:bg-black/30">
              {TONE_ICON[i.tone]}
            </span>
            <div>
              <p className="text-sm font-semibold">{i.title}</p>
              <p className="mt-1 text-xs opacity-90">{i.body}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
