// Native, dependency-free relative time formatting. Replaces
// date-fns/formatDistanceToNow for the public review components,
// shaving ~30KB from those route bundles.
//
// Two modes:
//   - addSuffix:false → "3 días" / "3 days"  (Intl.NumberFormat unit style)
//   - addSuffix:true  → "hace 3 días" / "3 days ago"  (Intl.RelativeTimeFormat)

type Unit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second'

const UNITS: Array<{ unit: Unit; ms: number }> = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
]

export interface FormatRelativeTimeOptions {
  /** BCP-47 language tag. Defaults to 'es'. */
  locale?: string
  /** When true, returns "hace 3 días" / "3 days ago". When false, just "3 días" / "3 days". */
  addSuffix?: boolean
  /** Override `Date.now()` — useful for tests. */
  now?: number
}

export function formatRelativeTime(
  date: Date | string | number,
  { locale = 'es', addSuffix = false, now = Date.now() }: FormatRelativeTimeOptions = {},
): string {
  const target = typeof date === 'object' ? date.getTime() : new Date(date).getTime()
  const diffMs = target - now
  const absMs = Math.abs(diffMs)

  // Pick the largest unit whose value is ≥ 1.
  const match = UNITS.find((u) => absMs >= u.ms) ?? UNITS[UNITS.length - 1]!
  const value = Math.round(diffMs / match.ms)

  if (addSuffix) {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    return rtf.format(value, match.unit)
  }

  // For "without suffix", Intl.NumberFormat with style:'unit' produces the
  // pluralized "3 días" / "1 day" / "3 hours" form natively.
  const nf = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: match.unit,
    unitDisplay: 'long',
  })
  return nf.format(Math.abs(value))
}
