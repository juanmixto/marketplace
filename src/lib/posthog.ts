import posthog from 'posthog-js'

/**
 * Single place that knows whether PostHog is usable. Guards against SSR and
 * missing config so call sites can stay terse.
 */
let initialized = false

function getApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  return key && key.length > 0 ? key : null
}

function getApiHost(): string {
  // Production sets this to https://raizdirecta.es/ingest, which is
  // routed by a Cloudflare Worker (infra/cloudflare/posthog-proxy/)
  // to eu.i.posthog.com — the proxy evades ad-blockers that
  // recognize *.posthog.com as a tracker and would otherwise drop
  // 10-25% of events. Dev and staging leave the var unset and
  // connect to PostHog directly so debugging doesn't need a Worker
  // deploy round-trip.
  //
  // src/lib/flags.ts:61 mirrors this fallback. Keep both in sync
  // if the EU host ever changes — see infra/cloudflare/posthog-proxy/
  // README.md § "Rotate the upstream host".
  return process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com'
}

export function isPostHogEnabled(): boolean {
  return typeof window !== 'undefined' && getApiKey() !== null
}

export function initPostHog(): void {
  if (initialized) return
  if (typeof window === 'undefined') return
  const apiKey = getApiKey()
  if (!apiKey) return

  try {
    posthog.init(apiKey, {
      api_host: getApiHost(),
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      persistence: 'localStorage+cookie',
      disable_session_recording: true,
      loaded: ph => {
        if (process.env.NODE_ENV === 'development') {
          ph.debug(false)
        }
      },
    })
    initialized = true
  } catch {
    // Silent: analytics must never break the app.
  }
}

export function identifyPostHog(
  distinctId: string,
  properties: Record<string, unknown> = {},
): void {
  if (!isPostHogEnabled()) return
  try {
    posthog.identify(distinctId, properties)
  } catch {
    // Silent
  }
}

export function resetPostHog(): void {
  if (!isPostHogEnabled()) return
  try {
    posthog.reset()
  } catch {
    // Silent
  }
}

export function capturePostHog(
  event: string,
  properties: Record<string, unknown> = {},
): void {
  if (!isPostHogEnabled()) return
  try {
    posthog.capture(event, properties)
  } catch {
    // Silent
  }
}

export { posthog }
