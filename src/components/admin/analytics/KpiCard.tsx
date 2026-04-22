import type { DeltaMetric } from '@/domains/analytics/types'
import { formatPrice } from '@/lib/utils'

interface Props {
  label: string
  metric: DeltaMetric
  format?: 'currency' | 'number' | 'decimal' | 'percent'
  hint?: string
}

function formatValue(value: number, format: Props['format']): string {
  if (format === 'currency') return formatPrice(value)
  if (format === 'percent') return `${value.toFixed(1)}%`
  if (format === 'decimal') return value.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return Math.round(value).toLocaleString('es-ES')
}

function formatDelta(deltaPct: number | null): { text: string; tone: 'up' | 'down' | 'flat' } {
  if (deltaPct == null) return { text: 'sin histórico', tone: 'flat' }
  if (Math.abs(deltaPct) < 0.05) return { text: '0%', tone: 'flat' }
  const rounded = Math.round(deltaPct * 10) / 10
  return {
    text: `${rounded > 0 ? '↑' : '↓'} ${Math.abs(rounded).toFixed(1)}%`,
    tone: rounded > 0 ? 'up' : 'down',
  }
}

export function KpiCard({ label, metric, format = 'number', hint }: Props) {
  const delta = formatDelta(metric.deltaPct)
  const toneClass =
    delta.tone === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : delta.tone === 'down'
        ? 'text-red-600 dark:text-red-400'
        : 'text-[var(--muted)]'

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-light)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">
        {formatValue(metric.current, format)}
      </p>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className={`font-semibold ${toneClass}`}>{delta.text}</span>
        <span className="text-[var(--muted)]">
          prev: {formatValue(metric.previous, format)}
        </span>
      </div>
      {hint && <p className="mt-1 text-[11px] text-[var(--muted-light)]">{hint}</p>}
    </div>
  )
}
