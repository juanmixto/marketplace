import { PostHog } from 'posthog-node'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * Server-side feature flag evaluator.
 *
 * Fail-open policy (deliberate): if PostHog is unreachable, the SDK
 * throws, or the flag is unknown, isFeatureEnabled resolves `true`.
 * Features stay on when the flag service goes down — we do not want
 * a PostHog outage to tumble checkout. The ONLY way to "turn off" a
 * feature is an explicit `false` from the PostHog UI (or from the
 * FEATURE_FLAGS_OVERRIDE escape hatch below).
 *
 * Naming convention:
 *   - `kill-<area>`  — emergency off switch. Default `true` in UI.
 *   - `feat-<name>`  — work-in-progress feature gate. Default `false`
 *                      in UI, targeted by email/role for beta testers.
 *
 * See docs/conventions.md § Feature flags.
 */

export interface FlagContext {
  userId?: string
  email?: string
  role?: string
}

type OverrideMap = Record<string, boolean>

let clientPromise: Promise<PostHog | null> | null = null
let overrideCache: { raw: string | undefined; parsed: OverrideMap } | null = null

function getOverrides(): OverrideMap {
  const { featureFlagsOverrideRaw } = getServerEnv()
  if (overrideCache && overrideCache.raw === featureFlagsOverrideRaw) {
    return overrideCache.parsed
  }
  let parsed: OverrideMap = {}
  if (featureFlagsOverrideRaw) {
    try {
      const obj = JSON.parse(featureFlagsOverrideRaw)
      if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'boolean') parsed[key] = value
        }
      }
    } catch (err) {
      logger.warn('flags.override_parse_failed', { err })
    }
  }
  overrideCache = { raw: featureFlagsOverrideRaw, parsed }
  return parsed
}

async function getClient(): Promise<PostHog | null> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return null
  if (clientPromise) return clientPromise

  // Mirror of src/lib/posthog.ts:15. Production resolves to the
  // Cloudflare Worker proxy at https://raizdirecta.es/ingest so the
  // server-side flag-eval calls (this codepath) ride the same
  // ad-blocker-evading route as the client SDK. Server-side calls
  // don't go through ad-blockers, but routing them through the
  // proxy too keeps the upstream-host source of truth in one
  // env var instead of two divergent code paths.
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com'
  const { posthogPersonalApiKey } = getServerEnv()

  clientPromise = Promise.resolve(
    new PostHog(key, {
      host,
      personalApiKey: posthogPersonalApiKey,
      flushAt: 1,
      flushInterval: 0,
    })
  )
  return clientPromise
}

function distinctId(ctx: FlagContext | undefined): string {
  return ctx?.userId ?? ctx?.email ?? 'anonymous-server'
}

function personProperties(ctx: FlagContext | undefined): Record<string, string> {
  const props: Record<string, string> = {}
  if (ctx?.email) props.email = ctx.email
  if (ctx?.role) props.role = ctx.role
  return props
}

export async function isFeatureEnabled(
  key: string,
  ctx?: FlagContext
): Promise<boolean> {
  const overrides = getOverrides()
  const override = overrides[key]
  if (typeof override === 'boolean') return override

  try {
    const client = await getClient()
    if (!client) return true
    const result = await client.isFeatureEnabled(key, distinctId(ctx), {
      personProperties: personProperties(ctx),
    })
    if (result === undefined) return true
    return Boolean(result)
  } catch (err) {
    logger.warn('flags.eval_failed', { key, err })
    return true
  }
}

/**
 * Fail-closed variant of `isFeatureEnabled` for feature gates whose
 * "unknown" state MUST resolve to off — publish paths, destructive
 * actions, anything that cannot safely run during a PostHog outage.
 *
 * Returns `true` only when:
 *   - an explicit `true` override is present, OR
 *   - PostHog is configured AND returns a strict `true` for the key.
 *
 * A PostHog outage, a missing key, an exception, or an `undefined`
 * flag value all resolve to `false`. Use this INSTEAD OF
 * `isFeatureEnabled` for anything whose default-on behaviour during
 * an outage would be unacceptable.
 */
export async function isFeatureEnabledStrict(
  key: string,
  ctx?: FlagContext
): Promise<boolean> {
  const overrides = getOverrides()
  const override = overrides[key]
  if (typeof override === 'boolean') return override

  try {
    const client = await getClient()
    if (!client) return false
    const result = await client.isFeatureEnabled(key, distinctId(ctx), {
      personProperties: personProperties(ctx),
    })
    return result === true
  } catch (err) {
    logger.warn('flags.eval_failed_strict', { key, err })
    return false
  }
}

export function resetFlagsForTests(): void {
  clientPromise = null
  overrideCache = null
}
