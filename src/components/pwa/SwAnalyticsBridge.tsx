'use client'

// Receives postMessage events from the service worker and forwards them
// to PostHog. PostHog can't run inside the SW context (no window /
// no document), so the SW posts a structured message and the client
// re-emits it via the regular trackAnalyticsEvent path. This keeps a
// single PII-scrubbing surface and keeps the SW free of analytics deps.
//
// Message shape (must match what public/sw.js posts):
//   { type: 'analytics', event: string, props: Record<string, unknown> }
//
// Anything else is ignored — defensive against future SW message types.

import { useEffect } from 'react'
import { trackAnalyticsEvent } from '@/lib/analytics'

interface AnalyticsMessage {
  type: 'analytics'
  event: string
  props?: Record<string, unknown>
}

const isAnalyticsMessage = (data: unknown): data is AnalyticsMessage => {
  if (!data || typeof data !== 'object') return false
  const m = data as Record<string, unknown>
  return m.type === 'analytics' && typeof m.event === 'string'
}

export function SwAnalyticsBridge(): null {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const handler = (event: MessageEvent) => {
      if (!isAnalyticsMessage(event.data)) return
      trackAnalyticsEvent(event.data.event, event.data.props ?? {})
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])
  return null
}
