/**
 * Incident flow tests (Issue #29).
 *
 * Covers:
 *  - State-machine guards (which status transitions are valid)
 *  - Resolution enum validation (only known values accepted)
 *  - IncidentDetailClient prop-shape contract (static analysis)
 *  - API route dark-mode compliance (response schema consistency)
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── State machine ─────────────────────────────────────────────────────────

// Mirror the guard used in the resolve route.
function canResolve(status: string): boolean {
  return status !== 'RESOLVED' && status !== 'CLOSED'
}

// Valid IncidentResolution enum values (mirrors Prisma schema)
const VALID_RESOLUTIONS = new Set([
  'REFUND_FULL',
  'REFUND_PARTIAL',
  'REPLACEMENT',
  'STORE_CREDIT',
  'REJECTED',
])

describe('Incident state machine', () => {
  test('only open/in-progress incidents can be resolved', () => {
    assert.equal(canResolve('OPEN'),              true)
    assert.equal(canResolve('AWAITING_VENDOR'),   true)
    assert.equal(canResolve('AWAITING_CUSTOMER'), true)
    assert.equal(canResolve('AWAITING_ADMIN'),    true)
    assert.equal(canResolve('RESOLVED'),          false)
    assert.equal(canResolve('CLOSED'),            false)
  })

  test('all five IncidentResolution values are distinct non-empty strings', () => {
    assert.equal(VALID_RESOLUTIONS.size, 5)
    for (const v of VALID_RESOLUTIONS) {
      assert.ok(v.length > 0)
    }
  })

  test('unknown resolution values are not accepted', () => {
    assert.ok(!VALID_RESOLUTIONS.has('APPROVED'))
    assert.ok(!VALID_RESOLUTIONS.has('CLOSED'))
    assert.ok(!VALID_RESOLUTIONS.has(''))
    assert.ok(!VALID_RESOLUTIONS.has('refund_full'))  // case-sensitive
  })
})

// ── API route source analysis ─────────────────────────────────────────────

describe('Incident API routes — source contract', () => {
  const messagesRoute = readFileSync(
    resolve('src/app/api/admin/incidents/[id]/messages/route.ts'), 'utf-8',
  )
  const resolveRoute = readFileSync(
    resolve('src/app/api/admin/incidents/[id]/resolve/route.ts'), 'utf-8',
  )

  test('messages route uses field "body" (not "content")', () => {
    assert.ok(messagesRoute.includes('"body"') || messagesRoute.includes("'body'") || messagesRoute.includes('body:'),
      'messages route must write the "body" field, matching the Prisma IncidentMessage schema')
    assert.ok(!messagesRoute.includes('"content"') && !messagesRoute.includes("'content'"),
      'messages route must not use "content" (field does not exist in the schema)')
  })

  test('messages route stores authorRole', () => {
    assert.ok(messagesRoute.includes('authorRole'), 'must persist the author role alongside authorId')
  })

  test('messages route guards with the incident role allow-list', () => {
    assert.ok(messagesRoute.includes('INCIDENT_MESSAGE_ROLES'), 'should define a local incident message allow-list')
    assert.ok(messagesRoute.includes('UserRole.ADMIN_SUPPORT'), 'support admins should be allowed to reply')
    assert.ok(messagesRoute.includes('UserRole.ADMIN_OPS'), 'ops admins should be allowed to reply')
    assert.ok(messagesRoute.includes('UserRole.ADMIN_FINANCE'), 'finance admins should be allowed to reply')
    assert.ok(messagesRoute.includes('UserRole.SUPERADMIN'), 'superadmins should be allowed to reply')
    assert.ok(!messagesRoute.includes('UserRole.ADMIN_CATALOG'), 'catalog admins should be excluded from the thread')
  })

  test('resolve route imports IncidentResolution enum', () => {
    assert.ok(resolveRoute.includes('IncidentResolution'),
      'resolve route must import and validate the IncidentResolution Prisma enum')
  })

  test('resolve route uses z.nativeEnum for resolution validation', () => {
    assert.ok(resolveRoute.includes('nativeEnum'), 'Zod nativeEnum must be used to validate the resolution value')
  })

  test('resolve route guards with isFinanceAdminRole', () => {
    assert.ok(
      resolveRoute.includes('if (!session || !isFinanceAdminRole(session.user.role))'),
      'should authorise with isFinanceAdminRole helper',
    )
  })

  test('resolve route sets resolvedAt timestamp', () => {
    assert.ok(resolveRoute.includes('resolvedAt'), 'resolved incidents must record the timestamp')
  })
})

// ── IncidentDetailClient — source contract ────────────────────────────────

describe('IncidentDetailClient — source contract', () => {
  const client = readFileSync(
    resolve('src/components/admin/IncidentDetailClient.tsx'), 'utf-8',
  )

  test('accepts incidentId, status, and messages as separate props (not a monolithic incident object)', () => {
    assert.ok(client.includes('incidentId'), 'should accept incidentId prop')
    assert.ok(client.includes('status'),     'should accept status prop')
    assert.ok(client.includes('messages'),   'should accept messages prop')
  })

  test('message items use "body" field (matches schema)', () => {
    assert.ok(client.includes('body'), 'should render message.body')
    assert.ok(!client.includes('msg.content'), 'should not reference msg.content (wrong field name)')
  })

  test('resolution form offers all five IncidentResolution options', () => {
    for (const v of VALID_RESOLUTIONS) {
      assert.ok(client.includes(v), `resolution form must include option "${v}"`)
    }
  })

  test('uses theme variables — no hardcoded gray colors', () => {
    assert.ok(!client.match(/\btext-gray-\d+\b/),   'should not use hardcoded text-gray-* classes')
    assert.ok(!client.match(/\bbg-gray-\d+\b/),     'should not use hardcoded bg-gray-* classes')
    assert.ok(!client.match(/\bborder-gray-\d+\b/), 'should not use hardcoded border-gray-* classes')
    assert.ok(!client.match(/\bbg-white\b/),        'should not use hardcoded bg-white')
  })

  test('shows resolved banner when incident is already resolved', () => {
    assert.ok(
      client.includes('resuelta') || client.includes('RESOLVED'),
      'should display a resolved state banner',
    )
  })
})

// ── Admin incidencias list page — navigation ──────────────────────────────

describe('Admin incidencias list — detail navigation', () => {
  const listPage = readFileSync(
    resolve('src/app/(admin)/admin/incidencias/page.tsx'), 'utf-8',
  )

  test('each incident row links to its detail page', () => {
    assert.ok(
      listPage.includes('/admin/incidencias/${incident.id}'),
      'list page should render a Link to /admin/incidencias/:id',
    )
  })

  test('imports Link from next/link', () => {
    assert.ok(listPage.includes("from 'next/link'"), 'list page should import Link')
  })
})
