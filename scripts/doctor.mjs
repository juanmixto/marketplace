/**
 * Portable doctor. Used by:
 *   - marketplace-pwa-server.sh (dev preview)
 *   - .github/workflows/doctor.yml (CI gate)
 *
 * Same three layers of defence as the bash script:
 *   1. Schema drift via `prisma migrate status`
 *   2. Unauthenticated HTTP probes of representative routes
 *   3. Deep probe via /api/healthcheck (one Prisma query per critical model)
 *
 * Exits 0 on success, 1 on any failure. CLI output is human-readable;
 * pass --json for a machine-readable report.
 *
 * Usage:
 *   node scripts/doctor.mjs [--base-url http://localhost:3000] [--json] [--skip-migrations]
 */

import { execSync } from 'node:child_process'

const args = new Set(process.argv.slice(2))
const baseUrl =
  (() => {
    const flag = '--base-url'
    const idx = process.argv.indexOf(flag)
    if (idx === -1) return 'http://localhost:3000'
    return process.argv[idx + 1] ?? 'http://localhost:3000'
  })().replace(/\/$/, '')
const asJson = args.has('--json')
const skipMigrations = args.has('--skip-migrations')

const PROBES = [
  { expected: 200, path: '/' },
  { expected: 200, path: '/manifest.webmanifest' },
  { expected: 200, path: '/offline' },
  { expected: 200, path: '/productos' },
  { expected: 200, path: '/buscar' },
  { expected: 307, path: '/cuenta' },
  { expected: 307, path: '/carrito' },
  { expected: 307, path: '/vendor/dashboard' },
  { expected: 307, path: '/admin/dashboard' },
  { expected: 200, path: '/api/catalog/featured?limit=3' },
  { expected: 200, path: '/api/healthcheck' },
]

/**
 * `prisma migrate status` with a short timeout. Returns:
 *   - { ok: true } when schema in sync
 *   - { ok: false, detail } otherwise
 */
function checkMigrationStatus() {
  if (skipMigrations) return { ok: true, skipped: true }
  try {
    const out = execSync('npx prisma migrate status', {
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const synced = /Database schema is up to date|following migration.*have been applied/i.test(
      out
    )
    if (synced) return { ok: true, output: out.trim() }
    return { ok: false, detail: 'Drift detected', output: out.trim() }
  } catch (err) {
    return {
      ok: false,
      detail: 'prisma migrate status failed',
      output: err instanceof Error ? err.message : String(err),
    }
  }
}

async function probeHttp(probe) {
  const url = `${baseUrl}${probe.path}`
  try {
    const res = await fetch(url, { redirect: 'manual' })
    return { ...probe, got: res.status }
  } catch (err) {
    return {
      ...probe,
      got: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function probeHealthcheck() {
  try {
    const res = await fetch(`${baseUrl}/api/healthcheck`)
    const body = await res.json()
    return {
      httpStatus: res.status,
      ok: Boolean(body?.ok),
      checks: body?.checks ?? {},
    }
  } catch (err) {
    return {
      httpStatus: 0,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function classifyProbe(result) {
  if (result.got === result.expected) return 'pass'
  if (typeof result.got === 'number' && result.got >= 500) return 'fail'
  return 'warn'
}

async function main() {
  const report = {
    ok: true,
    baseUrl,
    schema: checkMigrationStatus(),
    probes: [],
    healthcheck: null,
  }

  if (!report.schema.ok) report.ok = false

  for (const probe of PROBES) {
    const result = await probeHttp(probe)
    result.status = classifyProbe(result)
    if (result.status === 'fail') report.ok = false
    report.probes.push(result)
  }

  report.healthcheck = await probeHealthcheck()
  if (!report.healthcheck.ok) report.ok = false

  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  } else {
    renderHuman(report)
  }

  process.exit(report.ok ? 0 : 1)
}

function renderHuman(report) {
  console.log('── doctor · schema drift check ────────────────────────────────')
  if (report.schema.skipped) {
    console.log('  ⚠ skipped (--skip-migrations)')
  } else if (report.schema.ok) {
    console.log('  ✓ schema in sync')
  } else {
    console.log(`  ✗ ${report.schema.detail}`)
    if (report.schema.output) {
      console.log(report.schema.output.split('\n').map((l) => `    ${l}`).join('\n'))
    }
  }

  console.log('\n── doctor · route probes (unauthenticated) ────────────────────')
  for (const p of report.probes) {
    const icon = p.status === 'pass' ? '✓' : p.status === 'fail' ? '✗' : '⚠'
    const pad = p.path.padEnd(40)
    if (p.status === 'pass') {
      console.log(`  ${icon} ${pad}${p.got}`)
    } else if (p.status === 'fail') {
      console.log(`  ${icon} ${pad}${p.got} ← 5xx, server-side crash`)
    } else {
      console.log(`  ${icon} ${pad}got ${p.got} expected ${p.expected}`)
    }
  }

  console.log('\n── doctor · /api/healthcheck deep probe ───────────────────────')
  if (report.healthcheck.ok) {
    console.log('  ✓ all Prisma probes passed')
  } else {
    console.log('  ✗ healthcheck reports failures:')
    if (report.healthcheck.error) {
      console.log(`    error: ${report.healthcheck.error}`)
    }
    for (const [model, result] of Object.entries(report.healthcheck.checks)) {
      if (!result.ok) {
        console.log(`    ${model}: ${result.error ?? 'unknown failure'}`)
      }
    }
  }

  console.log()
  if (report.ok) {
    console.log(
      '✓ doctor PASSED — no schema drift, no 5xx on probed routes, all Prisma models healthy'
    )
  } else {
    console.log('✗ doctor FAILED — address the checks above before considering the deploy healthy')
  }
}

main().catch((err) => {
  console.error('[doctor] unhandled error:', err)
  process.exit(1)
})
