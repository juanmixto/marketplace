#!/usr/bin/env -S npx tsx
/**
 * Pre-flight env validation for production / staging deploys.
 *
 * Runs the same Zod schema (parseServerEnv) the server uses at boot.
 * If validation fails, the deploy aborts in <2 seconds — instead of
 * after a 3-5 minute Docker build that ends in a crash-loop on start.
 *
 * Catches the 2026-05-04 class of regression: a guard added to
 * src/lib/env.ts (e.g. `CRON_SECRET required in APP_ENV=production`)
 * is mergeable to main without anyone exercising it against the prod
 * env file. The first deploy after such a guard lands sees a green
 * build but a crash-loop on container start — unless something runs
 * the schema BEFORE the build.
 *
 * Usage (called by scripts/deploy-local-env.sh after env_file is loaded):
 *   npx tsx scripts/preflight-env.ts <env-name>
 *
 * Exit codes:
 *   0 — env file passes the production schema
 *   1 — schema rejected the env file (deploy must abort)
 *   2 — wrong arguments
 */

import { parseServerEnv } from '../src/lib/env'

const envName = process.argv[2]
if (!envName || !['development', 'staging', 'production'].includes(envName)) {
  console.error('Usage: preflight-env.ts <development|staging|production>')
  process.exit(2)
}

try {
  parseServerEnv(process.env)
} catch (err) {
  // The schema throws plain `new Error(human-readable)` for env-level
  // checks (CRON_SECRET, STRIPE keys in prod, etc.) and a ZodError for
  // shape violations. Both have a `.message` worth showing.
  const message = err instanceof Error ? err.message : String(err)
  console.error('')
  console.error(`✗ Pre-flight env validation FAILED for ${envName}.`)
  console.error('')
  console.error('  ' + message.split('\n').join('\n  '))
  console.error('')
  console.error(
    `  Fix the env file (.env.${envName}) before retrying. The same check runs at server boot — deploying without fixing this would leave the container in a crash loop.`,
  )
  console.error('')
  process.exit(1)
}

// Soft warnings: optional infra that degrades silently when missing.
// We don't fail the deploy (the app still works without it) but we
// surface it so the operator knows what they're shipping without.
//
// Pattern motivated by two recent incidents:
//   - 2026-05-04 (#1265): NEXT_PUBLIC_POSTHOG_KEY missing in prod for
//     ~1 day before anyone noticed analytics were dead.
//   - 2026-05-05: Sentry was 95% implemented but missing DSN, so every
//     error in prod was invisible — exactly what made the previous
//     night's debugging take 8 hours instead of 30 minutes.
const warnings: string[] = []
if (envName === 'production') {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    warnings.push(
      'NEXT_PUBLIC_POSTHOG_KEY is missing — analytics will be dead. Get the key from your PostHog project settings.',
    )
  }
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN && !process.env.SENTRY_DSN) {
    warnings.push(
      'NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN both missing — error reporting is dead. Without it, client-side React errors and server-side exceptions will not surface to oncall. Get the DSN from sentry.io project settings.',
    )
  }
}

if (warnings.length > 0) {
  console.warn('')
  console.warn(`⚠  Pre-flight WARNINGS for ${envName} (deploy will proceed):`)
  for (const w of warnings) {
    console.warn('  ⚠  ' + w)
  }
  console.warn('')
}

console.log(`✓ Pre-flight env validation passed for ${envName}.`)
