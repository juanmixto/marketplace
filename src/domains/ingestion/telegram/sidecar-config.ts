/**
 * Server-only sidecar configuration reader.
 *
 * Admin actions (auth flow, chat listing) call the sidecar directly,
 * as opposed to the worker path which goes through
 * `createTelethonHttpProvider`. Both read the same env vars so the
 * deployment surface stays single.
 */

export interface TelethonSidecarConfig {
  baseUrl: string
  sharedSecret: string
  timeoutMs: number
}

export function getTelethonSidecarConfig(): TelethonSidecarConfig {
  const baseUrl = process.env.TELEGRAM_SIDECAR_URL?.trim() ?? ''
  const sharedSecret = process.env.TELEGRAM_SIDECAR_TOKEN?.trim() ?? ''
  const timeoutRaw = process.env.TELEGRAM_SIDECAR_TIMEOUT_MS?.trim() ?? ''
  const timeoutMs = Number.isFinite(Number(timeoutRaw)) && Number(timeoutRaw) > 0
    ? Number(timeoutRaw)
    : 15_000

  if (!baseUrl) {
    throw new Error(
      'TELEGRAM_SIDECAR_URL not configured — set it in .env or PostHog-style config before onboarding Telegram connections.',
    )
  }
  if (!sharedSecret) {
    throw new Error(
      'TELEGRAM_SIDECAR_TOKEN not configured — must match SIDECAR_SHARED_SECRET in the sidecar env.',
    )
  }
  return { baseUrl, sharedSecret, timeoutMs }
}
