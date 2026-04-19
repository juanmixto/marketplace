import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { DEV_ROUTES_ALLOWLIST } from '@/lib/dev-routes'

/**
 * Issue #589: every file under `src/app/dev/**` must appear on
 * DEV_ROUTES_ALLOWLIST. A dev-only route that ships to production
 * would expose internal snapshots (carrier labels, fulfillment data,
 * PII from address snapshots, etc.). The edge proxy 404s the whole
 * `/dev/*` subtree in production, but this test is the structural
 * check that nobody silently adds a new dev route without an explicit
 * decision documented on the allow-list.
 *
 * Adding a route here is a security decision — document WHY.
 */

const DEV_ROOT = path.join(process.cwd(), 'src', 'app', 'dev')

const ROUTE_FILE_NAMES = new Set(['page.tsx', 'page.ts', 'route.ts', 'route.tsx'])

function listRouteFiles(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = path.join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      listRouteFiles(full, out)
    } else if (ROUTE_FILE_NAMES.has(name)) {
      out.push(path.relative(process.cwd(), full))
    }
  }
  return out
}

test('every route file under src/app/dev/** is on DEV_ROUTES_ALLOWLIST', () => {
  const discovered = listRouteFiles(DEV_ROOT).sort()
  const allowed = new Set(DEV_ROUTES_ALLOWLIST.map(entry => entry.path))
  const undeclared = discovered.filter(file => !allowed.has(file))

  assert.deepEqual(
    undeclared,
    [],
    `New dev-only route(s) detected without an entry on DEV_ROUTES_ALLOWLIST
(src/proxy.ts). Either add an entry documenting WHY the route exists and
what it would leak in production, or delete / relocate the route:\n` +
      undeclared.map(f => `  - ${f}`).join('\n'),
  )
})

test('DEV_ROUTES_ALLOWLIST entries point at real files', () => {
  const missing: string[] = []
  for (const entry of DEV_ROUTES_ALLOWLIST) {
    const full = path.join(process.cwd(), entry.path)
    try {
      statSync(full)
    } catch {
      missing.push(entry.path)
    }
  }
  assert.deepEqual(
    missing,
    [],
    `DEV_ROUTES_ALLOWLIST references files that do not exist. Remove the
stale entry or restore the file:\n` + missing.map(p => `  - ${p}`).join('\n'),
  )
})

test('DEV_ROUTES_ALLOWLIST entries carry a non-trivial rationale', () => {
  for (const entry of DEV_ROUTES_ALLOWLIST) {
    assert.ok(
      entry.why && entry.why.trim().length >= 40,
      `Entry for ${entry.path} must document WHY in at least 40 chars. Got: ${entry.why}`,
    )
  }
})

test('every allow-listed dev route has an inline NODE_ENV === "production" self-gate', () => {
  // Defense in depth: the edge proxy 404s /dev/* in production, but we
  // also want each page to fail closed on its own so a hand-crafted
  // request that somehow bypasses the proxy (local preview server,
  // unit test harness, misconfigured deployment) still notFound()s.
  const ungated: string[] = []
  for (const entry of DEV_ROUTES_ALLOWLIST) {
    const source = readFileSync(path.join(process.cwd(), entry.path), 'utf8')
    const hasGate =
      /process\.env\.NODE_ENV\s*===\s*['"]production['"]/.test(source) ||
      /NODE_ENV\s*!==\s*['"]production['"]/.test(source)
    if (!hasGate) ungated.push(entry.path)
  }
  assert.deepEqual(
    ungated,
    [],
    `Dev routes must self-gate on NODE_ENV. Add a production check that
returns notFound() / 404:\n` + ungated.map(p => `  - ${p}`).join('\n'),
  )
})
