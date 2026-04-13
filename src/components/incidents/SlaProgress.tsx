'use client'

/**
 * SLA progress visualization for incident threads (#139).
 *
 * Renders a slim horizontal bar showing how much of the 72h response
 * window has been consumed, plus a human-readable remaining-time label.
 * Three states:
 *
 *   - on-track  (≥ 25 % remaining)         emerald
 *   - urgent    (< 25 % remaining)         amber
 *   - overdue   (deadline already passed)  red
 *
 * Pure presentation: takes a Date, derives everything client-side so the
 * countdown updates correctly across timezones / locale changes without
 * server round-trips. Closed cases (RESOLVED / CLOSED) hide the bar
 * entirely — pass `hidden` from the parent.
 */

import { useMemo } from 'react'
import { useT } from '@/i18n'

interface Props {
  /** Absolute SLA deadline. Comes from Incident.slaDeadline. */
  deadline: Date
  /** When true, the bar isn't rendered (use for resolved/closed). */
  hidden?: boolean
  /**
   * The full SLA window in hours used to draw the "100%" baseline.
   * Defaults to 72h to match INCIDENT_SLA_HOURS in src/domains/incidents/errors.ts.
   * Exposed as a prop so future configurable SLAs don't need a separate component.
   */
  windowHours?: number
}

function formatRemaining(msRemaining: number, t: (key: string) => string): string {
  if (msRemaining <= 0) {
    return t('incident.sla.overdue')
  }
  const minutes = Math.round(msRemaining / 60_000)
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} h`
  }
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours > 0 ? `${days} d ${remHours} h` : `${days} d`
}

export function SlaProgress({ deadline, hidden, windowHours = 72 }: Props) {
  const t = useT()

  const { fillPct, state, label } = useMemo(() => {
    const now = Date.now()
    const deadlineMs = deadline.getTime()
    const windowMs = windowHours * 60 * 60 * 1000
    const startMs = deadlineMs - windowMs
    const elapsedMs = Math.max(0, now - startMs)
    const remainingMs = deadlineMs - now

    // Bar fills from 0 → 100% as time runs out.
    const rawPct = (elapsedMs / windowMs) * 100
    const clampedPct = Math.max(0, Math.min(100, rawPct))

    let nextState: 'on-track' | 'urgent' | 'overdue'
    if (remainingMs <= 0) {
      nextState = 'overdue'
    } else if (remainingMs / windowMs < 0.25) {
      nextState = 'urgent'
    } else {
      nextState = 'on-track'
    }

    return {
      fillPct: clampedPct,
      state: nextState,
      label: formatRemaining(remainingMs, t as (key: string) => string),
    }
  }, [deadline, windowHours, t])

  if (hidden) return null

  const fillClass =
    state === 'overdue'
      ? 'bg-red-500 dark:bg-red-400'
      : state === 'urgent'
        ? 'bg-amber-500 dark:bg-amber-400'
        : 'bg-emerald-500 dark:bg-emerald-400'

  const labelClass =
    state === 'overdue'
      ? 'text-red-700 dark:text-red-300'
      : state === 'urgent'
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-emerald-700 dark:text-emerald-300'

  return (
    <div className="space-y-1">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]"
        role="progressbar"
        aria-valuenow={Math.round(fillPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('incident.sla.label')}
      >
        <div
          className={`h-full transition-all ${fillClass}`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <p className={`text-[11px] font-medium ${labelClass}`}>
        {t('incident.sla.label')}: {label}
      </p>
    </div>
  )
}
