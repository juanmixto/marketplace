import { resetServerEnvCache } from '@/lib/env'
import { resetFlagsForTests } from '@/lib/flags'

/**
 * Override feature-flag evaluation for the duration of a test. Writes
 * to FEATURE_FLAGS_OVERRIDE, which is checked BEFORE PostHog in
 * src/lib/flags.ts, so tests never hit the network. Mirrors the
 * resetServerEnvCache pattern used elsewhere in test/integration/.
 *
 * Always pair with clearTestFlagOverrides() in an after() hook.
 */
export function setTestFlagOverrides(overrides: Record<string, boolean>): void {
  process.env.FEATURE_FLAGS_OVERRIDE = JSON.stringify(overrides)
  resetServerEnvCache()
  resetFlagsForTests()
}

export function clearTestFlagOverrides(): void {
  delete process.env.FEATURE_FLAGS_OVERRIDE
  resetServerEnvCache()
  resetFlagsForTests()
}
