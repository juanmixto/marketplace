'use client'

import { useEffect, useState } from 'react'
import posthog from 'posthog-js'

/**
 * Client-side feature flag hook. Fail-open: returns `true` until
 * PostHog reports otherwise. Sibling of src/lib/flags.ts (server).
 * See docs/conventions.md § Feature flags.
 */
export function useFeatureFlag(key: string): boolean {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const read = () => {
        const value = posthog.isFeatureEnabled(key)
        setEnabled(value !== false)
      }
      read()
      posthog.onFeatureFlags(read)
    } catch {
      setEnabled(true)
    }
  }, [key])

  return enabled
}
