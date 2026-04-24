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
 * Parse the dev-only `NEXT_PUBLIC_FEATURE_FLAGS_OVERRIDE` env var.
 * Exposed to the client bundle on purpose so the sidebar can pick up
 * the same overrides the server uses in dev (`FEATURE_FLAGS_OVERRIDE`
 * is server-only). In production the var stays undefined and the
 * hooks behave exactly as before.
 */
function parsePublicOverrides(): Record<string, boolean> {
  const raw = process.env.NEXT_PUBLIC_FEATURE_FLAGS_OVERRIDE
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Fail-closed variant of `useFeatureFlag` for `feat-*` flags that
 * default to off. Returns `true` only when PostHog explicitly reports
 * the flag enabled; stays `false` during the load window and on any
 * PostHog outage. Use this to gate UI affordances that must NOT leak
 * pre-GA (admin nav entries, beta surfaces).
 *
 * In dev, `NEXT_PUBLIC_FEATURE_FLAGS_OVERRIDE` is consulted first so
 * the sidebar stays consistent with the server-side guard (which
 * reads `FEATURE_FLAGS_OVERRIDE`). The override is a compile-time
 * env var, so a prod build without it set behaves strictly as
 * before.
 */
export function useFeatureFlagStrict(key: string): boolean {
  const override = parsePublicOverrides()[key]
  const [enabled, setEnabled] = useState(typeof override === 'boolean' ? override : false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof override === 'boolean') {
      // The env-var override wins — no point polling PostHog.
      setEnabled(override)
      return
    }
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
  }, [key, override])

  return enabled
}
