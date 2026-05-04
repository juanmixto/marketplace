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

console.log(`✓ Pre-flight env validation passed for ${envName}.`)
