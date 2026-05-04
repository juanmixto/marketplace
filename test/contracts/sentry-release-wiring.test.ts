import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Pin the chain that gets `NEXT_PUBLIC_COMMIT_SHA` from `git rev-parse`
 * all the way into the Sentry `release` tag on every event (#1214).
 *
 * The chain is:
 *
 *   scripts/deploy-local-env.sh   → exports NEXT_PUBLIC_COMMIT_SHA from git
 *   docker-compose.prod.yml       → passes it as build arg to `app` service
 *   Dockerfile                    → declares ARG + ENV before `npm run build`
 *   src/lib/sentry/config.ts      → reads it for `release`
 *
 * If any link breaks (someone trims the build arg, drops the ARG line,
 * renames the env var) Sentry events ship with `release: undefined` and
 * "first seen on latest release" alerts go silent. The 2026-04 BuildBadge
 * incident (#1135 + #1138) was the same shape on the badge side; this
 * test guards the Sentry side.
 *
 * Each assertion is a structural pin, not a behavioural check — the
 * actual behaviour is exercised in production every deploy. CI just
 * makes sure no future PR removes a critical line silently.
 */

const root = process.cwd()
function readRepoFile(rel: string): string {
  return readFileSync(join(root, rel), 'utf-8')
}

test('deploy-local-env.sh exports NEXT_PUBLIC_COMMIT_SHA from git rev-parse', () => {
  const script = readRepoFile('scripts/deploy-local-env.sh')
  assert.match(
    script,
    /export\s+NEXT_PUBLIC_COMMIT_SHA=.*git\s+rev-parse/,
    'deploy script must derive NEXT_PUBLIC_COMMIT_SHA from `git rev-parse`. Without this, the build arg is empty and Sentry releases tag as undefined.',
  )
  // The badge incident (#1135) was caused by the export living after
  // `docker compose build` instead of before. Catch that ordering bug.
  const exportIdx = script.search(/export\s+NEXT_PUBLIC_COMMIT_SHA=.*git\s+rev-parse/)
  const buildIdx = script.search(/compose[^\n]*build\s+app/)
  assert.ok(exportIdx > 0, 'export NEXT_PUBLIC_COMMIT_SHA= not found')
  assert.ok(buildIdx > 0, '`compose build app` not found')
  assert.ok(
    exportIdx < buildIdx,
    'export NEXT_PUBLIC_COMMIT_SHA must run BEFORE `compose build app` so docker-compose substitutes it into build.args.',
  )
})

test('docker-compose.prod.yml passes NEXT_PUBLIC_COMMIT_SHA as a build arg to app', () => {
  const compose = readRepoFile('docker-compose.prod.yml')
  // The shape: under `app: build: args:` we expect an entry like
  //   NEXT_PUBLIC_COMMIT_SHA: ${NEXT_PUBLIC_COMMIT_SHA:-unknown}
  // Allow whitespace variation but require the var name AND the
  // ${NEXT_PUBLIC_COMMIT_SHA...} substitution.
  assert.match(
    compose,
    /NEXT_PUBLIC_COMMIT_SHA:\s*\$\{\s*NEXT_PUBLIC_COMMIT_SHA\s*[:\-}]/,
    'docker-compose.prod.yml must pass NEXT_PUBLIC_COMMIT_SHA as build.args. Without this the Dockerfile ARG defaults to "unknown".',
  )
})

test('Dockerfile declares ARG + ENV for NEXT_PUBLIC_COMMIT_SHA before npm run build', () => {
  const dockerfile = readRepoFile('Dockerfile')
  // ARG is what receives the value from compose build.args.
  assert.match(
    dockerfile,
    /ARG\s+NEXT_PUBLIC_COMMIT_SHA/,
    'Dockerfile must declare ARG NEXT_PUBLIC_COMMIT_SHA in the build stage.',
  )
  // ENV propagates the ARG into the npm run build step where Next inlines it.
  assert.match(
    dockerfile,
    /ENV\s+NEXT_PUBLIC_COMMIT_SHA=\$NEXT_PUBLIC_COMMIT_SHA/,
    'Dockerfile must promote ARG to ENV so `next build` sees the value.',
  )
  // The promotion has to come BEFORE `RUN npm run build`. If it lands
  // after, the build inlines undefined.
  const envIdx = dockerfile.search(/ENV\s+NEXT_PUBLIC_COMMIT_SHA=\$NEXT_PUBLIC_COMMIT_SHA/)
  const buildIdx = dockerfile.search(/RUN\s+npm\s+run\s+build/)
  assert.ok(envIdx > 0 && buildIdx > 0)
  assert.ok(
    envIdx < buildIdx,
    'ENV NEXT_PUBLIC_COMMIT_SHA must come BEFORE `RUN npm run build`. If you reorder this, Next inlines undefined into the bundle.',
  )
})

test('sentry config still reads NEXT_PUBLIC_COMMIT_SHA for release', () => {
  const cfg = readRepoFile('src/lib/sentry/config.ts')
  assert.match(
    cfg,
    /process\.env\.NEXT_PUBLIC_COMMIT_SHA/,
    'src/lib/sentry/config.ts must read NEXT_PUBLIC_COMMIT_SHA. Renaming requires updating Dockerfile + compose + deploy script.',
  )
})
