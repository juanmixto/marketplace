import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { POST as POST_INCIDENT } from '@/app/api/incidents/route'
import { POST as POST_INCIDENT_MESSAGE } from '@/app/api/incidents/[id]/messages/route'
import { POST as POST_ADMIN_INCIDENT_MESSAGE } from '@/app/api/admin/incidents/[id]/messages/route'
import { POST as POST_ADMIN_INCIDENT_RESOLVE } from '@/app/api/admin/incidents/[id]/resolve/route'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * Issue #401: the incidents domain ships with cross-actor tests at the
 * action level (test/integration/incidents-buyer.test.ts), but the
 * HTTP route layer that wraps those actions has no coverage. This
 * suite exercises every incidents route handler with the wrong actor
 * and asserts the route returns 4xx — i.e. the role + ownership gate
 * is honored at the boundary, not just inside the action.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

async function createDeliveredOrder(customerId: string) {
  return db.order.create({
    data: {
      orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId,
      status: 'DELIVERED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 25,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 25,
    },
  })
}

async function createIncidentForBuyer(customerId: string) {
  const order = await createDeliveredOrder(customerId)
  return db.incident.create({
    data: {
      orderId: order.id,
      customerId,
      type: 'WRONG_ITEM',
      description: 'Wrong item received in the box.',
      status: 'OPEN',
      slaDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
    },
  })
}

function jsonRequest(
  url: string,
  body: unknown,
  method = 'POST',
  extraHeaders: Record<string, string> = {},
) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST_INCIDENT>[0]
}

test('POST /api/incidents returns 404 when the order belongs to another buyer', async () => {
  const buyerA = await createUser('CUSTOMER')
  const buyerB = await createUser('CUSTOMER')
  const orderA = await createDeliveredOrder(buyerA.id)

  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))
  const res = await POST_INCIDENT(
    jsonRequest('http://localhost/api/incidents', {
      orderId: orderA.id,
      type: 'WRONG_ITEM',
      description: 'Trying to open an incident on a stranger order.',
    })
  )
  assert.equal(res.status, 404)

  const incidents = await db.incident.findMany({ where: { orderId: orderA.id } })
  assert.equal(incidents.length, 0)
})

test('POST /api/incidents/[id]/messages returns 404 when buyer B replies on buyer A incident', async () => {
  const buyerA = await createUser('CUSTOMER')
  const buyerB = await createUser('CUSTOMER')
  const incidentA = await createIncidentForBuyer(buyerA.id)

  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))
  const res = await POST_INCIDENT_MESSAGE(
    jsonRequest(`http://localhost/api/incidents/${incidentA.id}/messages`, {
      body: 'Hijack attempt',
    }),
    { params: Promise.resolve({ id: incidentA.id }) }
  )
  assert.equal(res.status, 404)

  const messages = await db.incidentMessage.findMany({ where: { incidentId: incidentA.id } })
  assert.equal(messages.length, 0)
})

test('legitimate owner can post a message on their own incident via the public route', async () => {
  const buyer = await createUser('CUSTOMER')
  const incident = await createIncidentForBuyer(buyer.id)

  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const res = await POST_INCIDENT_MESSAGE(
    jsonRequest(`http://localhost/api/incidents/${incident.id}/messages`, {
      body: 'I would like a refund please.',
    }),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(res.status, 201)

  const stored = await db.incidentMessage.findMany({ where: { incidentId: incident.id } })
  assert.equal(stored.length, 1)
  assert.equal(stored[0].authorId, buyer.id)
})

test('POST /api/admin/incidents/[id]/messages rejects non-admin (buyer + vendor) and ADMIN_CATALOG (#1146)', async () => {
  const buyer = await createUser('CUSTOMER')
  const incident = await createIncidentForBuyer(buyer.id)

  // A buyer trying the admin route must get 403, even if it is THEIR incident.
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const buyerRes = await POST_ADMIN_INCIDENT_MESSAGE(
    jsonRequest(`http://localhost/api/admin/incidents/${incident.id}/messages`, {
      body: 'pretending to be admin',
    }),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(buyerRes.status, 403)

  // A vendor session also gets 403 — vendors do not have admin scope.
  const vendorUser = await db.user.create({
    data: {
      email: `vendor-${Date.now()}@example.com`,
      firstName: 'V',
      lastName: 'Tester',
      role: 'VENDOR',
      isActive: true,
    },
  })
  useTestSession(buildSession(vendorUser.id, 'VENDOR'))
  const vendorRes = await POST_ADMIN_INCIDENT_MESSAGE(
    jsonRequest(`http://localhost/api/admin/incidents/${incident.id}/messages`, {
      body: 'pretending to be admin from vendor',
    }),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(vendorRes.status, 403)

  // #1146: ADMIN_CATALOG can no longer post messages on incidents — this
  // surface is for support/ops/finance/superadmin (separation of duties).
  const catalogUser = await db.user.create({
    data: {
      email: `catalog-${Date.now()}@example.com`,
      firstName: 'C',
      lastName: 'Tester',
      role: 'ADMIN_CATALOG',
      isActive: true,
    },
  })
  useTestSession(buildSession(catalogUser.id, 'ADMIN_CATALOG'))
  const catalogRes = await POST_ADMIN_INCIDENT_MESSAGE(
    jsonRequest(`http://localhost/api/admin/incidents/${incident.id}/messages`, {
      body: 'catalog probing',
    }),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(catalogRes.status, 403)

  const messages = await db.incidentMessage.findMany({ where: { incidentId: incident.id } })
  assert.equal(messages.length, 0)
})

test('POST /api/admin/incidents/[id]/resolve rejects non-admin and accepts SUPERADMIN', async () => {
  const buyer = await createUser('CUSTOMER')
  const incident = await createIncidentForBuyer(buyer.id)

  // Non-admin → 403 (#1141)
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const denied = await POST_ADMIN_INCIDENT_RESOLVE(
    jsonRequest(
      `http://localhost/api/admin/incidents/${incident.id}/resolve`,
      { resolution: 'REFUND_FULL' },
      'POST',
      { 'idempotency-key': 'k-' + Date.now().toString(36) + '-aaaa' },
    ),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(denied.status, 403)
  const stillOpen = await db.incident.findUnique({ where: { id: incident.id } })
  assert.equal(stillOpen?.status, 'OPEN')

  // SUPERADMIN → 200 (with Idempotency-Key, required since #1141)
  const admin = await db.user.create({
    data: {
      email: `admin-${Date.now()}@example.com`,
      firstName: 'A',
      lastName: 'Tester',
      role: 'SUPERADMIN',
      isActive: true,
    },
  })
  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  const ok = await POST_ADMIN_INCIDENT_RESOLVE(
    jsonRequest(
      `http://localhost/api/admin/incidents/${incident.id}/resolve`,
      { resolution: 'REFUND_FULL' },
      'POST',
      { 'idempotency-key': 'k-' + Date.now().toString(36) + '-bbbb' },
    ),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(ok.status, 200)
  const resolved = await db.incident.findUnique({ where: { id: incident.id } })
  assert.equal(resolved?.status, 'RESOLVED')
})

// ─── #1141 / #1146 / #1152: tighter incident-resolve gate + idempotency ───

const FINANCE_ROLES_FOR_RESOLVE = ['ADMIN_FINANCE', 'ADMIN_OPS', 'SUPERADMIN'] as const
const NON_FINANCE_ROLES_FOR_RESOLVE = ['ADMIN_CATALOG', 'ADMIN_SUPPORT'] as const

for (const role of NON_FINANCE_ROLES_FOR_RESOLVE) {
  test(`POST /api/admin/incidents/[id]/resolve: ${role} → 403 (no finance privilege)`, async () => {
    const buyer = await createUser('CUSTOMER')
    const incident = await createIncidentForBuyer(buyer.id)

    const admin = await db.user.create({
      data: {
        email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
        firstName: role,
        lastName: 'Tester',
        role,
        isActive: true,
      },
    })
    useTestSession(buildSession(admin.id, role))
    const res = await POST_ADMIN_INCIDENT_RESOLVE(
      jsonRequest(
        `http://localhost/api/admin/incidents/${incident.id}/resolve`,
        { resolution: 'REFUND_FULL' },
        'POST',
        { 'idempotency-key': 'k-' + Date.now().toString(36) + '-cccc' },
      ),
      { params: Promise.resolve({ id: incident.id }) }
    )
    assert.equal(res.status, 403)
    const after = await db.incident.findUnique({ where: { id: incident.id } })
    assert.equal(after?.status, 'OPEN')
  })
}

for (const role of FINANCE_ROLES_FOR_RESOLVE) {
  test(`POST /api/admin/incidents/[id]/resolve: ${role} → 200 + audit log`, async () => {
    const buyer = await createUser('CUSTOMER')
    const incident = await createIncidentForBuyer(buyer.id)

    const admin = await db.user.create({
      data: {
        email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
        firstName: role,
        lastName: 'Tester',
        role,
        isActive: true,
      },
    })
    useTestSession(buildSession(admin.id, role))
    const res = await POST_ADMIN_INCIDENT_RESOLVE(
      jsonRequest(
        `http://localhost/api/admin/incidents/${incident.id}/resolve`,
        { resolution: 'REFUND_FULL' },
        'POST',
        { 'idempotency-key': 'k-' + Date.now().toString(36) + '-' + role },
      ),
      { params: Promise.resolve({ id: incident.id }) }
    )
    assert.equal(res.status, 200, `${role} should resolve`)

    // AuditLog row exists (#1141: refunds + resolutions go through
    // createAuditLog, no longer logger.info-only).
    const log = await db.auditLog.findFirst({
      where: { entityType: 'Incident', entityId: incident.id },
      orderBy: { createdAt: 'desc' },
    })
    assert.ok(log, 'audit log row must exist after resolve')
    assert.equal(log!.action, 'INCIDENT_RESOLVED')
    assert.equal(log!.actorId, admin.id)
  })
}

test('POST /api/admin/incidents/[id]/resolve without Idempotency-Key → 400', async () => {
  const buyer = await createUser('CUSTOMER')
  const incident = await createIncidentForBuyer(buyer.id)
  const admin = await db.user.create({
    data: {
      email: `super-${Date.now()}@example.com`,
      firstName: 'S',
      lastName: 'A',
      role: 'SUPERADMIN',
      isActive: true,
    },
  })
  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  const res = await POST_ADMIN_INCIDENT_RESOLVE(
    jsonRequest(
      `http://localhost/api/admin/incidents/${incident.id}/resolve`,
      { resolution: 'REFUND_FULL' },
    ),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(res.status, 400)
  const after = await db.incident.findUnique({ where: { id: incident.id } })
  assert.equal(after?.status, 'OPEN')
})

test('POST /api/admin/incidents/[id]/resolve replay with same Idempotency-Key → 409', async () => {
  const buyer = await createUser('CUSTOMER')
  const incident = await createIncidentForBuyer(buyer.id)
  const admin = await db.user.create({
    data: {
      email: `super-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
      firstName: 'S',
      lastName: 'A',
      role: 'SUPERADMIN',
      isActive: true,
    },
  })
  useTestSession(buildSession(admin.id, 'SUPERADMIN'))

  const key = 'replay-' + Date.now().toString(36) + '-zzzz'
  const first = await POST_ADMIN_INCIDENT_RESOLVE(
    jsonRequest(
      `http://localhost/api/admin/incidents/${incident.id}/resolve`,
      { resolution: 'REFUND_FULL' },
      'POST',
      { 'idempotency-key': key },
    ),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(first.status, 200)

  const second = await POST_ADMIN_INCIDENT_RESOLVE(
    jsonRequest(
      `http://localhost/api/admin/incidents/${incident.id}/resolve`,
      { resolution: 'REFUND_FULL' },
      'POST',
      { 'idempotency-key': key },
    ),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(second.status, 409)

  // Exactly one audit row (the first call's), no second AuditLog
  const logs = await db.auditLog.findMany({
    where: { entityType: 'Incident', entityId: incident.id },
  })
  assert.equal(logs.length, 1, 'idempotent replay must not double-log')
})

test('admin can post on a buyer incident via the admin route (not the public one)', async () => {
  const buyer = await createUser('CUSTOMER')
  const incident = await createIncidentForBuyer(buyer.id)

  const admin = await db.user.create({
    data: {
      email: `admin-${Date.now()}@example.com`,
      firstName: 'A',
      lastName: 'Tester',
      role: 'SUPERADMIN',
      isActive: true,
    },
  })

  // Public buyer route: an admin session should NOT be allowed to post
  // a buyer reply on someone else's incident through the buyer route.
  // The action's `isOwner || isAdmin` check actually allows admins to
  // reply through the public route too — we pin that current behaviour
  // here so a future change is visible. If product decides admins must
  // ALWAYS use the admin route, this test is the canary.
  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  const viaPublic = await POST_INCIDENT_MESSAGE(
    jsonRequest(`http://localhost/api/incidents/${incident.id}/messages`, {
      body: 'admin via public route',
    }),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(viaPublic.status, 201)

  const viaAdmin = await POST_ADMIN_INCIDENT_MESSAGE(
    jsonRequest(`http://localhost/api/admin/incidents/${incident.id}/messages`, {
      body: 'admin via admin route',
    }),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(viaAdmin.status, 201)

  const messages = await db.incidentMessage.findMany({
    where: { incidentId: incident.id },
    orderBy: { createdAt: 'asc' },
  })
  assert.equal(messages.length, 2)
  assert.ok(messages.every(m => m.authorId === admin.id))
})
