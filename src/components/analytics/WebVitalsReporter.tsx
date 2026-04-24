'use client'

import { useReportWebVitals } from 'next/web-vitals'
import { capturePostHog, isPostHogEnabled } from '@/lib/posthog'

/**
 * Pipes Core Web Vitals from Next's built-in reporter into PostHog so we
 * get real p75 LCP / INP / CLS / TTFB / FCP from production users — not
 * just lab numbers from Lighthouse synthetic runs.
 *
 * Why this component exists:
 *   - Before this, the repo had no runtime perf telemetry. A regression
 *     that landed between Lighthouse runs (or on a page that Lighthouse
 *     doesn't hit) was invisible until a user complained.
 *   - PostHog is already wired up (see `src/lib/posthog.ts`). Reusing it
 *     avoids a second SDK for the same job and gives us the existing
 *     session/identification plumbing for free.
 *
 * Event shape:
 *   `$web_vitals` with `{ name, value, rating, id, delta, navigationType }`.
 *   The `$` prefix marks these as PostHog-internal events so they group
 *   cleanly in dashboards without polluting business event lists.
 *
 * Sampling is handled at the PostHog project level — don't add sampling
 * here or p75 math downstream will be biased.
 */
export function WebVitalsReporter() {
  useReportWebVitals(metric => {
    if (!isPostHogEnabled()) return
    capturePostHog('$web_vitals', {
      name: metric.name,
      value: metric.value,
      rating: (metric as { rating?: string }).rating,
      delta: metric.delta,
      id: metric.id,
      navigationType: (metric as { navigationType?: string }).navigationType,
      path: typeof window !== 'undefined' ? window.location.pathname : undefined,
    })
  })

  return null
}
