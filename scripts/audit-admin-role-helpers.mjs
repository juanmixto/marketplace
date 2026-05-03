#!/usr/bin/env node
/**
 * audit-admin-role-helpers.mjs
 *
 * Lints out the "drift trap" patterns called out in
 * `docs/authz-audit.md` § "Role precision":
 *
 *   1. `requireAdmin()` followed by an inline `hasRole(session.user.role, [...])`
 *      check inside the same function. The inline check is correct
 *      today, but every refactor of `UserRole` has to touch it; the
 *      narrow helpers (`requireFinanceAdmin`, `requireOpsAdmin`,
 *      `requireCatalogAdmin`, `requireSuperadmin`) declare intent at
 *      the call site and break loudly if a future role split would
 *      change the semantics.
 *
 *   2. `isAdminRole(...)` used as the primary guard inside
 *      `src/app/api/admin/**` route handlers. Admin sub-roles exist
 *      precisely so admin-finance / admin-catalog / admin-support
 *      can have different reach. A flat `isAdminRole` gate quietly
 *      collapses those distinctions.
 *
 * The audit only inspects the two domains where this matters:
 *   - `src/domains/admin/actions.ts` (server actions)
 *   - `src/app/api/admin/` (REST handlers)
 *
 * It is intentionally NOT a `--soft` ratchet: the cleanup ships with
 * the audit, so any new violation is a regression and must be fixed
 * (not parked in a baseline). If a legitimate exception arises, fix
 * the helper or document the call site here — do not weaken the
 * audit.
 *
 * Usage:
 *   node scripts/audit-admin-role-helpers.mjs
 *
 * Exit codes:
 *   0 — clean
 *   1 — at least one violation
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const ADMIN_ACTIONS = join(ROOT, 'src', 'domains', 'admin', 'actions.ts')
const ADMIN_API_DIR = join(ROOT, 'src', 'app', 'api', 'admin')

// Allow-list for the few legitimate `isAdminRole` usages: routes that
// genuinely accept ANY admin (e.g. KPI dashboards that all admins
// see, or 2FA endpoints that gate on identity not role precision).
// Add a route here only with a one-line justification so a reviewer
// can sanity-check the exemption.
const ISADMINROLE_ALLOWLIST = new Set([
  // KPIs / generic stats — all admins see top-line numbers.
  'src/app/api/admin/stats/route.ts',
  // 2FA enrolment self-service: gate is "is this caller an admin
  // managing their own factor", not "what kind of admin".
  'src/app/api/admin/2fa/enroll/route.ts',
  'src/app/api/admin/2fa/verify/route.ts',
  'src/app/api/admin/2fa/disable/route.ts',
])

function listFilesRecursive(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const s = statSync(full)
    if (s.isDirectory()) out.push(...listFilesRecursive(full))
    else if (s.isFile() && /\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

const violations = []

// ── 1) requireAdmin() + inline hasRole() in the same function ──────────────
if (existsSafe(ADMIN_ACTIONS)) {
  const text = readFileSync(ADMIN_ACTIONS, 'utf8')
  // Split into top-level functions by the `export async function` boundary.
  // Looking inside each block for the pair pattern is robust enough — we
  // don't need a real parser since the file follows a strict convention.
  const fnRegex = /export\s+async\s+function\s+(\w+)\s*\([^)]*\)\s*[^{]*\{/g
  const indices = []
  let m
  while ((m = fnRegex.exec(text)) !== null) {
    indices.push({ name: m[1], start: m.index })
  }
  for (let i = 0; i < indices.length; i++) {
    const { name, start } = indices[i]
    const end = i + 1 < indices.length ? indices[i + 1].start : text.length
    const body = text.slice(start, end)
    const callsRequireAdmin = /\brequireAdmin\s*\(/.test(body)
    const callsInlineHasRole = /\bhasRole\s*\(\s*session\.user\.role/.test(body)
    if (callsRequireAdmin && callsInlineHasRole) {
      violations.push({
        kind: 'requireAdmin+inline',
        file: relative(ROOT, ADMIN_ACTIONS),
        symbol: name,
        message:
          `${name}() pairs requireAdmin() with an inline hasRole(session.user.role, [...]). ` +
          'Use the matching narrow helper instead (requireFinanceAdmin / requireOpsAdmin / requireCatalogAdmin / requireSuperadmin).',
      })
    }
  }
}

// ── 2) isAdminRole as primary guard in admin API routes ────────────────────
if (existsSafe(ADMIN_API_DIR)) {
  for (const file of listFilesRecursive(ADMIN_API_DIR)) {
    const rel = relative(ROOT, file).replaceAll('\\', '/')
    if (ISADMINROLE_ALLOWLIST.has(rel)) continue
    const text = readFileSync(file, 'utf8')
    if (/\bisAdminRole\s*\(/.test(text)) {
      violations.push({
        kind: 'isAdminRole-in-api',
        file: rel,
        message:
          `${rel} uses isAdminRole(...) as a guard. Admin sub-roles exist for separation of duties — ` +
          'use isFinanceAdminRole / isOpsAdminRole / isCatalogAdminRole / isSuperadminRole as appropriate, ' +
          'or add this route to ISADMINROLE_ALLOWLIST in scripts/audit-admin-role-helpers.mjs with a one-line justification.',
      })
    }
  }
}

if (violations.length === 0) {
  console.log('[audit-admin-role-helpers] OK — no requireAdmin+inline pairs, no flat isAdminRole gates in admin routes.')
  process.exit(0)
}

console.error(`[audit-admin-role-helpers] ${violations.length} violation(s):`)
for (const v of violations) {
  console.error(`  - [${v.kind}] ${v.file}${v.symbol ? `::${v.symbol}` : ''}`)
  console.error(`      ${v.message}`)
}
process.exit(1)

function existsSafe(p) {
  try { statSync(p); return true } catch { return false }
}
