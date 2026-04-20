import type { TelegramIngestionProvider, TelegramIngestionProviderCode } from './types'
import { createMockProvider } from './mock'
import { createTelethonHttpProvider } from './telethon-http'

/**
 * Lazy factory for the Telegram ingestion provider.
 *
 * Selected by `INGESTION_TELEGRAM_PROVIDER`:
 *   - `mock` (default) — in-memory fixtures; no I/O.
 *   - `telethon` — HTTP bridge to the Python sidecar.
 *
 * Module-level state is intentionally absent: calling `getProvider`
 * without env vars does not open sockets, does not read files, and
 * does not cache. The worker invokes this once per job; overhead is
 * trivial compared to the network cost of the job itself.
 */

export const TELEGRAM_PROVIDER_ENV = 'INGESTION_TELEGRAM_PROVIDER'

export class TelegramProviderConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TelegramProviderConfigError'
  }
}

export function resolveProviderCode(
  env: NodeJS.ProcessEnv = process.env,
): TelegramIngestionProviderCode {
  const raw = env[TELEGRAM_PROVIDER_ENV]?.trim().toLowerCase()
  if (!raw || raw === 'mock') return 'mock'
  if (raw === 'telethon') return 'telethon'
  throw new TelegramProviderConfigError(
    `Invalid ${TELEGRAM_PROVIDER_ENV}=${raw} (expected "mock" or "telethon")`,
  )
}

export function getTelegramProvider(
  env: NodeJS.ProcessEnv = process.env,
): TelegramIngestionProvider {
  const code = resolveProviderCode(env)
  if (code === 'mock') {
    // An empty fixture in production is deliberate: if someone ever
    // runs the worker without opting into `telethon`, the mock returns
    // no data rather than silently syncing fabricated messages.
    return createMockProvider()
  }

  const baseUrl = env.TELEGRAM_SIDECAR_URL?.trim()
  const sharedSecret = env.TELEGRAM_SIDECAR_TOKEN?.trim()
  if (!baseUrl || !sharedSecret) {
    throw new TelegramProviderConfigError(
      `${TELEGRAM_PROVIDER_ENV}=telethon requires TELEGRAM_SIDECAR_URL and TELEGRAM_SIDECAR_TOKEN`,
    )
  }
  const timeoutMs = parseIntOr(env.TELEGRAM_SIDECAR_TIMEOUT_MS, 15_000)
  return createTelethonHttpProvider({
    baseUrl,
    sharedSecret,
    timeoutMs,
  })
}

function parseIntOr(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
