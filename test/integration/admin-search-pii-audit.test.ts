import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  auditAdminSearch,
  detectPiiInQuery,
  hashSearchTerm,
} from '@/domains/admin/search-pii'
import {
  buildSession,
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * Issue #1353 (epic #1346 — PII pre-launch).
 *
 * Admin pages let an operator search by free-text. Without an audit
 * trail an admin (or stolen session) can enumerate the customer base
 * by typing `@gmail.com`, `+346…`, `28010` into the same input that
 * legitimately accepts orderNumber. This suite exercises:
 *   - the PII classifier
 *   - the audit-log emission (with hashed query, never plaintext)
 *   - the per-actor burst alert
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

// ─── Classifier coverage ─────────────────────────────────────────────────────

test('detectPiiInQuery flags emails and partial email probes', () => {
  assert.equal(detectPiiInQuery('juan@example.com'), 'email')
  assert.equal(detectPiiInQuery('@gmail.com'), 'email')
  assert.equal(detectPiiInQuery('juan@'), 'email')
})

test('detectPiiInQuery flags Spanish phone numbers', () => {
  assert.equal(detectPiiInQuery('600123456'), 'phone')
  assert.equal(detectPiiInQuery('+34 600123456'), 'phone')
  assert.equal(detectPiiInQuery('+346'), 'phone')
})

test('detectPiiInQuery flags 4-5 digit postal probes', () => {
  assert.equal(detectPiiInQuery('28001'), 'postal')
  assert.equal(detectPiiInQuery('2800'), 'postal')
})

test('detectPiiInQuery returns free-text for orderNumber and product name', () => {
  assert.equal(detectPiiInQuery('ORD-123-XYZ'), 'free-text')
  assert.equal(detectPiiInQuery('queso manchego'), 'free-text')
  assert.equal(detectPiiInQuery(''), 'free-text')
})

// ─── Audit-log emission ──────────────────────────────────────────────────────

test('auditAdminSearch writes an AuditLog row with hashed query for PII inputs', async () => {
  const admin = await createUser('ADMIN_OPS')
  useTestSession(buildSession(admin.id, 'ADMIN_OPS'))

  const result = await auditAdminSearch({
    scope: 'admin-orders',
    actorId: admin.id,
    actorRole: 'ADMIN_OPS',
    query: 'juan@example.com',
    matchedCount: 3,
  })

  assert.equal(result.kind, 'email')
  assert.equal(result.audited, true)
  assert.equal(result.burst, false)

  const rows = await db.auditLog.findMany({
    where: { action: 'DATA_SEARCH', entityType: 'admin-orders' },
  })
  assert.equal(rows.length, 1)
  const row = rows[0]
  assert.equal(row?.actorId, admin.id)
  assert.equal(row?.actorRole, 'ADMIN_OPS')
  // Critical: the literal email must NEVER land in the audit row.
  const blob = JSON.stringify(row)
  assert.equal(blob.includes('juan@example.com'), false, 'plaintext email leaked into AuditLog')
  // The hash IS recorded.
  const expectedHash = hashSearchTerm('juan@example.com')
  assert.ok(blob.includes(expectedHash), 'expected sha256 of query in audit row')
})

test('auditAdminSearch is a no-op for free-text inputs (orderNumber)', async () => {
  const admin = await createUser('ADMIN_OPS')

  const result = await auditAdminSearch({
    scope: 'admin-orders',
    actorId: admin.id,
    actorRole: 'ADMIN_OPS',
    query: 'ORD-123-XYZ',
    matchedCount: 1,
  })

  assert.equal(result.kind, 'free-text')
  assert.equal(result.audited, false)
  assert.equal(await db.auditLog.count({ where: { action: 'DATA_SEARCH' } }), 0)
})

test('auditAdminSearch flags burst when actor crosses 20-in-10-min threshold', async () => {
  const admin = await createUser('ADMIN_OPS')
  useTestSession(buildSession(admin.id, 'ADMIN_OPS'))

  // 20 PII searches succeed silently.
  for (let i = 0; i < 20; i++) {
    const result = await auditAdminSearch({
      scope: 'admin-orders',
      actorId: admin.id,
      actorRole: 'ADMIN_OPS',
      query: `probe${i}@example.com`,
      matchedCount: 0,
    })
    assert.equal(result.burst, false, `unexpected burst on iteration ${i}`)
  }

  // 21st flips the burst flag.
  const burst = await auditAdminSearch({
    scope: 'admin-orders',
    actorId: admin.id,
    actorRole: 'ADMIN_OPS',
    query: 'probe-final@example.com',
    matchedCount: 0,
  })
  assert.equal(burst.burst, true, 'expected burst on the 21st PII search')

  // All 21 audited regardless of burst — burst is an alerting signal,
  // not a gate.
  assert.equal(
    await db.auditLog.count({ where: { action: 'DATA_SEARCH', actorId: admin.id } }),
    21,
  )
})

test('hashSearchTerm is case-insensitive and trims whitespace', () => {
  assert.equal(
    hashSearchTerm('  Juan@Example.com  '),
    hashSearchTerm('juan@example.com'),
  )
})
