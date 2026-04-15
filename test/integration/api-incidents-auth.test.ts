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

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
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

test('POST /api/admin/incidents/[id]/messages rejects non-admin (buyer + vendor)', async () => {
  const buyer = await createUser('CUSTOMER')
  const incident = await createIncidentForBuyer(buyer.id)

  // A buyer trying the admin route must get 401, even if it is THEIR incident.
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const buyerRes = await POST_ADMIN_INCIDENT_MESSAGE(
    jsonRequest(`http://localhost/api/admin/incidents/${incident.id}/messages`, {
      body: 'pretending to be admin',
    }),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(buyerRes.status, 401)

  // A vendor session also gets 401 — vendors do not have admin scope.
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
  assert.equal(vendorRes.status, 401)

  const messages = await db.incidentMessage.findMany({ where: { incidentId: incident.id } })
  assert.equal(messages.length, 0)
})

test('POST /api/admin/incidents/[id]/resolve rejects non-admin and accepts SUPERADMIN', async () => {
  const buyer = await createUser('CUSTOMER')
  const incident = await createIncidentForBuyer(buyer.id)

  // Non-admin → 401
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const denied = await POST_ADMIN_INCIDENT_RESOLVE(
    jsonRequest(`http://localhost/api/admin/incidents/${incident.id}/resolve`, {
      resolution: 'REFUND_FULL',
    }),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(denied.status, 401)
  const stillOpen = await db.incident.findUnique({ where: { id: incident.id } })
  assert.equal(stillOpen?.status, 'OPEN')

  // SUPERADMIN → 200
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
    jsonRequest(`http://localhost/api/admin/incidents/${incident.id}/resolve`, {
      resolution: 'REFUND_FULL',
    }),
    { params: Promise.resolve({ id: incident.id }) }
  )
  assert.equal(ok.status, 200)
  const resolved = await db.incident.findUnique({ where: { id: incident.id } })
  assert.equal(resolved?.status, 'RESOLVED')
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
