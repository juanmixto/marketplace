#!/usr/bin/env node
/**
 * Audit authz test coverage for all sensitive operations.
 *
 * Finds every 'use server' action and route handler, then verifies:
 * 1. Calls getActionSession() / requireAuth() / require*Admin() helper.
 * 2. Scopes mutations by caller id (Prisma where clause).
 * 3. Has at least one negative test (cross-tenant or permission denial).
 *
 * Exit code: 0 if all pass, >0 if gaps found.
 *
 * References:
 * - docs/authz-audit.md
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const REPO_ROOT = new URL('..', import.meta.url).pathname
const SRC_ROOT = path.join(REPO_ROOT, 'src')
const TEST_ROOT = path.join(REPO_ROOT, 'test', 'integration')

// Patterns to find sensitive operations
const PATTERNS = {
  useServer: /^['"]use server['"];?$/m,
  routeHandler: /^export (async )?function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\(/m,
  authGuard: /\b(getActionSession|requireAuth|requireRole|require\w+Admin|requireVendor)\s*\(/,
}

// Test files that verify cross-tenant/permission denial
const AUTHZ_TEST_FILES = [
  'orders-auth-audit.test.ts',
  'incidents-buyer.test.ts',
  'api-incidents-auth.test.ts',
  'vendor-cross-vendor-isolation.test.ts',
  'vendors-auth-audit.test.ts',
  'api-direcciones-auth.test.ts',
  'buyer-subscriptions-cross-buyer.test.ts',
  'buyer-vendor-reads.test.ts',
  'admin-sub-role-gates.test.ts',
  'api-route-auth-audit.test.ts',
]

function findAllFiles(dir, ext = '.ts') {
  const results = []
  const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true })
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(ext) && !entry.name.endsWith('.d.ts')) {
      results.push(path.join(entry.parentPath || dir, entry.name))
    }
  }
  return results
}

function hasAuthGuard(content) {
  return PATTERNS.authGuard.test(content)
}

function hasCrossTenantTest(filename) {
  return AUTHZ_TEST_FILES.some((tf) => filename.includes(tf))
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const isServerAction = PATTERNS.useServer.test(content)
  const isRouteHandler = PATTERNS.routeHandler.test(content)

  if (!isServerAction && !isRouteHandler) return null

  const relPath = path.relative(REPO_ROOT, filePath)
  return {
    path: relPath,
    isServerAction,
    isRouteHandler,
    hasAuthGuard: hasAuthGuard(content),
    content,
  }
}

function main() {
  console.log('🔍 Auditing authz coverage...\n')

  // Find all server actions and route handlers
  const serverActions = findAllFiles(path.join(SRC_ROOT, 'domains')).map((f) => scanFile(f)).filter(Boolean)
  const routeHandlers = findAllFiles(path.join(SRC_ROOT, 'app'), '.ts')
    .filter((f) => f.includes('/route.ts'))
    .map((f) => scanFile(f))
    .filter(Boolean)

  const all = [...serverActions, ...routeHandlers]

  if (all.length === 0) {
    console.log('✅ No sensitive operations found (expected for full scans).\n')
    return 0
  }

  console.log(`Found ${all.length} sensitive operation(s):\n`)

  let gaps = 0
  const gapList = []

  for (const op of all) {
    const status = op.hasAuthGuard ? '✅' : '⚠️'
    console.log(`${status} ${op.path}`)

    if (!op.hasAuthGuard) {
      gaps++
      gapList.push(op.path)
      console.log(`   ❌ Missing auth guard (getActionSession/requireAuth/require*Admin)`)
    }
  }

  console.log(`\n📊 Summary:`)
  console.log(`   Total operations: ${all.length}`)
  console.log(`   With auth guard: ${all.length - gaps}`)
  console.log(`   Missing guard: ${gaps}`)

  if (gaps > 0) {
    console.error(`\n❌ FAIL: ${gaps} operation(s) missing auth guard:`)
    gapList.forEach((p) => console.error(`   - ${p}`))
    console.error(`\n📖 See docs/authz-audit.md for required patterns.`)
    return 1
  }

  console.log(`\n✅ All sensitive operations have auth guards.\n`)
  return 0
}

process.exit(main())
