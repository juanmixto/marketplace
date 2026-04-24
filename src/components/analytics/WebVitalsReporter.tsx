'use client'

import { useEffect } from 'react'
import { useReportWebVitals } from 'next/web-vitals'
import { capturePostHog, isPostHogEnabled } from '@/lib/posthog'

/**
 * Pipes Core Web Vitals and long-task telemetry into PostHog so we get
 * real p75 LCP / INP / CLS / TTFB / FCP — plus main-thread jank — from
 * production users, not just lab numbers from Lighthouse synthetic runs.
 *
 * Event shape:
 *   `$web_vitals` with `{ name, value, rating, id, delta, navigationType }`.
 *   `$long_task` with `{ duration, startTime, path }` for tasks ≥100ms.
 *   100ms noise floor: anything shorter is invisible to users on mid-tier
 *   mobile and would flood PostHog ingest.
 *
 * Sampling is handled at the PostHog project level — don't add sampling
 * here or p75 math downstream will be biased.
 */
const LONG_TASK_NOISE_FLOOR_MS = 100

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

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isPostHogEnabled()) return
    if (typeof PerformanceObserver === 'undefined') return

    let observer: PerformanceObserver | null = null
    try {
      observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.duration < LONG_TASK_NOISE_FLOOR_MS) continue
          capturePostHog('$long_task', {
            duration: Math.round(entry.duration),
            startTime: Math.round(entry.startTime),
            path: window.location.pathname,
          })
        }
      })
      observer.observe({ type: 'longtask', buffered: true })
    } catch {
      // Browser doesn't support longtask — Safari <16, older Firefox.
      // Silent no-op; Core Web Vitals still ship.
    }

    return () => observer?.disconnect()
  }, [])

  return null
}
