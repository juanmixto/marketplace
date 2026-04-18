import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Structural contract tests for scripts/doctor.mjs (#525).
 *
 * The script is used by two callers:
 *   1. marketplace-pwa-server.sh (dev preview)
 *   2. .github/workflows/doctor.yml (CI gate)
 *
 * Changing its surface (CLI flags, probes array, exit codes) silently
 * breaks one or both callers. These tests pin the contract.
 */

function readScript(): string {
  return readFileSync(join(process.cwd(), 'scripts/doctor.mjs'), 'utf-8')
}

test('scripts/doctor.mjs exists', () => {
  assert.ok(existsSync(join(process.cwd(), 'scripts/doctor.mjs')))
})

test('doctor.mjs covers the 3 expected defence layers', () => {
  const content = readScript()
  assert.ok(content.includes('prisma migrate status'), 'Layer 1: schema drift')
  assert.ok(content.includes('/api/healthcheck'), 'Layer 3: deep Prisma probe')
  // Layer 2: route probes array. Require the core 11 paths to be
  // present — removing any would break coverage invisibly.
  const expectedPaths = [
    "path: '/'",
    "path: '/manifest.webmanifest'",
    "path: '/offline'",
    "path: '/productos'",
    "path: '/buscar'",
    "path: '/cuenta'",
    "path: '/carrito'",
    "path: '/vendor/dashboard'",
    "path: '/admin/dashboard'",
    "path: '/api/catalog/featured",
    "path: '/api/healthcheck'",
  ]
  for (const p of expectedPaths) {
    assert.ok(content.includes(p), `doctor.mjs must probe ${p}`)
  }
})

test('doctor.mjs exits 1 on any failure, 0 on all pass', () => {
  const content = readScript()
  assert.ok(
    /process\.exit\(\s*report\.ok\s*\?\s*0\s*:\s*1\s*\)/.test(content),
    'doctor.mjs must exit 0 when report.ok is true, 1 otherwise'
  )
})

test('doctor.mjs accepts --base-url, --json, --skip-migrations flags', () => {
  const content = readScript()
  assert.ok(content.includes("'--base-url'"), 'must accept --base-url')
  assert.ok(content.includes("'--json'"), 'must accept --json')
  assert.ok(content.includes("'--skip-migrations'"), 'must accept --skip-migrations')
})

test('doctor.mjs --json emits a structured report', () => {
  const content = readScript()
  // The JSON branch must include the four top-level keys callers
  // (monitoring cron jobs, Slack integrations) rely on.
  assert.ok(content.includes('JSON.stringify(report'), 'emits JSON when --json is set')
  assert.ok(content.includes('baseUrl'), 'baseUrl field present')
  assert.ok(content.includes('schema'), 'schema field present')
  assert.ok(content.includes('probes'), 'probes field present')
  assert.ok(content.includes('healthcheck'), 'healthcheck field present')
})

test('doctor.mjs treats 5xx as failure, other mismatches as warn', () => {
  const content = readScript()
  // A non-5xx deviation is a warning (e.g. auth redirect pattern
  // changed from 307 to 302). Only 5xx blocks the deploy.
  assert.ok(content.includes('classifyProbe'), 'uses classifyProbe helper')
  assert.match(content, /got\s*>=\s*500/, 'treats >=500 as fail')
})

test('.github/workflows/doctor.yml exists and invokes doctor.mjs', () => {
  const workflowPath = join(process.cwd(), '.github/workflows/doctor.yml')
  assert.ok(existsSync(workflowPath), '.github/workflows/doctor.yml must exist')
  const content = readFileSync(workflowPath, 'utf-8')
  assert.ok(
    content.includes('node scripts/doctor.mjs'),
    'workflow must invoke node scripts/doctor.mjs'
  )
  assert.ok(content.includes('prisma migrate deploy'), 'workflow must apply migrations before probing')
  assert.ok(content.includes('npm run db:seed'), 'workflow must seed before probing (see #525 rationale)')
  assert.ok(content.includes('npm run build'), 'workflow must build in production mode')
  assert.ok(content.includes('timeout-minutes:'), 'workflow must have a timeout so flakes do not block')
})

test('marketplace-pwa-server.sh delegates to scripts/doctor.mjs (single source of truth)', () => {
  const scriptPath = '/home/whisper/marketplace-pwa-server.sh'
  if (!existsSync(scriptPath)) {
    // Script lives outside the repo; skip gracefully on machines that
    // don't have the dev preview set up.
    return
  }
  const stat = statSync(scriptPath)
  if (!stat.isFile()) return
  const content = readFileSync(scriptPath, 'utf-8')
  assert.ok(
    content.includes('node scripts/doctor.mjs'),
    'bash script must delegate to scripts/doctor.mjs instead of duplicating probe logic'
  )
})
