import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Issue #420 companion test: audits every `src/app/api/**\/route.ts`
 * and asserts each file is on either the PUBLIC_API_ROUTES allow-list
 * OR imports a session helper (getActionSession / auth() / require*).
 *
 * The edge proxy deliberately excludes `/api` from PROTECTED_PREFIXES
 * because REST handlers enforce their own session scoping. Without a
 * structural check, a new handler that forgets to call an auth helper
 * would expose the endpoint globally until someone happens to spot it
 * in review. This test is that check.
 *
 * Keep the allow-list small and explicit. Adding a route here is a
 * security decision — document WHY in the entry comment.
 */

const API_ROOT = path.join(process.cwd(), 'src', 'app', 'api')

/**
 * Routes that are PUBLIC by design. Every entry MUST document why.
 * Anything not on this list must import a session helper somewhere
 * in its body.
 */
const PUBLIC_API_ROUTES: ReadonlyArray<{ path: string; why: string }> = [
  {
    path: 'src/app/api/auth/[...nextauth]/route.ts',
    why: 'NextAuth core handler — owns the session cookie lifecycle.',
  },
  {
    path: 'src/app/api/auth/forgot-password/route.ts',
    why: 'Password-reset email request. Rate-limited. Must be reachable when logged out.',
  },
  {
    path: 'src/app/api/auth/reset-password/route.ts',
    why: 'Token-based reset. Auth is the token itself, not a session.',
  },
  {
    path: 'src/app/api/auth/register/route.ts',
    why: 'Account creation. Must be reachable when logged out.',
  },
  {
    path: 'src/app/api/auth/verify-email/route.ts',
    why: 'Email-link verification. Auth is the token in the URL, not a session.',
  },
  {
    path: 'src/app/api/contacto/route.ts',
    why: 'Public contact form. Rate-limited per IP and per identity.',
  },
  {
    path: 'src/app/api/catalog/featured/route.ts',
    why: 'Public catalog JSON for PWA periodic sync prefetch. No sensitive fields.',
  },
  {
    path: 'src/app/api/webhooks/stripe/route.ts',
    why: 'Stripe webhook. Authenticates via HMAC signature, not a session.',
  },
  {
    path: 'src/app/api/webhooks/sendcloud/route.ts',
    why: 'Sendcloud webhook. Authenticates via HMAC signature, not a session.',
  },
  {
    path: 'src/app/api/incidents/route.ts',
    why: 'Thin wrapper — delegates every mutation to openIncident() which calls getActionSession internally. Route file itself has no auth keyword.',
  },
  {
    path: 'src/app/api/incidents/[id]/messages/route.ts',
    why: 'Thin wrapper — delegates to postIncidentMessage() which enforces ownership via getActionSession.',
  },
]

const SESSION_KEYWORDS = [
  'getActionSession',
  'getServerSession',
  'requireVendor',
  'requireAdmin',
  'requireBuyer',
  'requireRole',
  "from '@/lib/auth'",
  'from "@/lib/auth"',
  ' auth()', // NextAuth v5 helper — loose match but scoped by leading space
  '\tauth()',
  '(auth())',
] as const

function listRouteFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...listRouteFiles(full))
    else if (entry === 'route.ts' || entry === 'route.tsx') out.push(full)
  }
  return out
}

function hasSessionKeyword(content: string): boolean {
  return SESSION_KEYWORDS.some((kw) => content.includes(kw))
}

test('every API route either imports a session helper OR is on the PUBLIC allow-list', () => {
  const absPublicSet = new Set(
    PUBLIC_API_ROUTES.map((r) => path.join(process.cwd(), r.path))
  )
  const routes = listRouteFiles(API_ROOT)

  const violations: string[] = []

  for (const file of routes) {
    const content = readFileSync(file, 'utf-8')
    const isPublic = absPublicSet.has(file)
    const hasAuth = hasSessionKeyword(content)

    if (!isPublic && !hasAuth) {
      const rel = path.relative(process.cwd(), file)
      violations.push(rel)
    }
  }

  assert.deepEqual(
    violations,
    [],
    `New API route(s) detected with no session helper and not on the
PUBLIC_API_ROUTES allow-list. Either:
  (a) add a call to getActionSession() / auth() / require* in the handler, OR
  (b) add the path to PUBLIC_API_ROUTES in this file with a clear reason.

Unauthenticated routes:
${violations.map((v) => `  - ${v}`).join('\n')}`
  )
})

test('PUBLIC_API_ROUTES entries all point to existing files', () => {
  const missing: string[] = []
  for (const entry of PUBLIC_API_ROUTES) {
    const abs = path.join(process.cwd(), entry.path)
    try {
      statSync(abs)
    } catch {
      missing.push(entry.path)
    }
  }
  assert.deepEqual(
    missing,
    [],
    `Stale entries in PUBLIC_API_ROUTES — these files don't exist. Remove:\n${missing.map((m) => `  - ${m}`).join('\n')}`
  )
})

test('PUBLIC_API_ROUTES entries all document a reason', () => {
  for (const entry of PUBLIC_API_ROUTES) {
    assert.ok(
      entry.why.length > 10,
      `PUBLIC_API_ROUTES entry ${entry.path} must document a reason. Got: ${JSON.stringify(entry.why)}`
    )
  }
})

test('PUBLIC_API_ROUTES has no duplicates', () => {
  const seen = new Set<string>()
  const dupes: string[] = []
  for (const entry of PUBLIC_API_ROUTES) {
    if (seen.has(entry.path)) dupes.push(entry.path)
    seen.add(entry.path)
  }
  assert.deepEqual(dupes, [], `Duplicate PUBLIC_API_ROUTES entries: ${dupes.join(', ')}`)
})
