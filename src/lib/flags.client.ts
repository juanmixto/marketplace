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

/**
 * Fail-closed variant of `useFeatureFlag` for `feat-*` flags that
 * default to off. Returns `true` only when PostHog explicitly reports
 * the flag enabled; stays `false` during the load window and on any
 * PostHog outage. Use this to gate UI affordances that must NOT leak
 * pre-GA (admin nav entries, beta surfaces).
 */
export function useFeatureFlagStrict(key: string): boolean {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const read = () => {
        const value = posthog.isFeatureEnabled(key)
        setEnabled(value === true)
      }
      read()
      posthog.onFeatureFlags(read)
    } catch {
      setEnabled(false)
    }
  }, [key])

  return enabled
}
