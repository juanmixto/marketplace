/**
 * Portable doctor. Used by:
 *   - marketplace-pwa-server.sh (dev preview)
 *   - .github/workflows/doctor.yml (CI gate)
 *
 * Four layers of defence:
 *   1. Schema drift via `prisma migrate status`
 *   2. Unauthenticated HTTP probes of representative routes
 *   3. Deep probe via /api/healthcheck (one Prisma query per critical model)
 *   4. Authenticated probes — real session cookies against post-auth
 *      pages (vendor dashboard, admin dashboard, buyer account). Only
 *      runs when --auth is passed. Catches 500s that hide past the
 *      middleware redirect.
 *
 * Exits 0 on success, 1 on any failure. CLI output is human-readable;
 * pass --json for a machine-readable report.
 *
 * Usage:
 *   node scripts/doctor.mjs [--base-url http://localhost:3000] [--json]
 *     [--skip-migrations] [--auth]
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
const runAuthProbes = args.has('--auth')

const AUTH_PROBE_MATRIX = [
  {
    userKey: 'customer',
    paths: ['/cuenta', '/cuenta/pedidos'],
  },
  {
    userKey: 'vendor',
    paths: ['/vendor/dashboard', '/vendor/pedidos'],
  },
  {
    userKey: 'admin',
    paths: ['/admin/dashboard'],
  },
]

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

/**
 * Authenticated probes (#526). For each (userKey, paths) pair:
 *   1. Resolve the seeded user id for the test email
 *   2. Build a NextAuth-compatible session cookie
 *   3. Hit every path with that cookie, expect 200 (not 307, not 5xx)
 *
 * Returns an array of { userKey, path, got, status, error? }.
 * Failure on any 5xx short-circuits report.ok.
 */
async function runAuthenticatedProbes() {
  try {
    const { buildSessionCookie, resolveSeededUserId, SEEDED_PROBE_USERS } =
      await import('./doctor-auth.mjs')

    const results = []
    for (const { userKey, paths } of AUTH_PROBE_MATRIX) {
      const user = SEEDED_PROBE_USERS[userKey]
      let seeded
      try {
        seeded = await resolveSeededUserId(user.email)
      } catch (err) {
        for (const path of paths) {
          results.push({
            userKey,
            path,
            got: 0,
            status: 'fail',
            error:
              err instanceof Error ? err.message : String(err),
          })
        }
        continue
      }
      const cookie = await buildSessionCookie({
        baseUrl,
        userId: seeded.id,
        role: seeded.role ?? user.role,
        email: user.email,
      })

      for (const path of paths) {
        try {
          const res = await fetch(`${baseUrl}${path}`, {
            redirect: 'manual',
            headers: { Cookie: cookie },
          })
          let status = 'pass'
          if (res.status >= 500) status = 'fail'
          else if (res.status !== 200) status = 'warn'
          results.push({ userKey, path, got: res.status, status })
        } catch (err) {
          results.push({
            userKey,
            path,
            got: 0,
            status: 'fail',
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
    return { ok: results.every((r) => r.status !== 'fail'), results }
  } catch (err) {
    return {
      ok: false,
      results: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function main() {
  const report = {
    ok: true,
    baseUrl,
    schema: checkMigrationStatus(),
    probes: [],
    healthcheck: null,
    authProbes: null,
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

  if (runAuthProbes) {
    report.authProbes = await runAuthenticatedProbes()
    if (!report.authProbes.ok) report.ok = false
  }

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

  if (report.authProbes) {
    console.log('\n── doctor · authenticated probes (post-auth 5xx hunter) ───────')
    if (report.authProbes.error) {
      console.log(`  ✗ setup error: ${report.authProbes.error}`)
    } else if (report.authProbes.results.length === 0) {
      console.log('  ⚠ no probes ran (AUTH_PROBE_MATRIX empty?)')
    } else {
      for (const r of report.authProbes.results) {
        const icon = r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : '⚠'
        const label = `${r.userKey} → ${r.path}`.padEnd(45)
        if (r.status === 'pass') {
          console.log(`  ${icon} ${label}${r.got}`)
        } else if (r.status === 'fail') {
          console.log(
            `  ${icon} ${label}${r.got} ← ${r.error ?? '5xx, server-side crash post-auth'}`,
          )
        } else {
          console.log(`  ${icon} ${label}got ${r.got} expected 200`)
        }
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
