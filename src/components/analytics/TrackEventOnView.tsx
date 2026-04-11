'use client'

import { useEffect, useRef } from 'react'
import { trackAnalyticsEvent, type AnalyticsEventName } from '@/lib/analytics'

interface TrackEventOnViewProps {
  event: AnalyticsEventName
  payload?: Record<string, unknown>
}

export function TrackEventOnView({ event, payload = {} }: TrackEventOnViewProps) {
  const hasTrackedRef = useRef(false)

  useEffect(() => {
    if (hasTrackedRef.current) return
    hasTrackedRef.current = true
    trackAnalyticsEvent(event, payload)
  }, [event, payload])

  return null
}
