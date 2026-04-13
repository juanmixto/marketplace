import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  addIncidentMessage,
  getIncidentDetail,
  getMyIncidents,
  IncidentAuthError,
  IncidentValidationError,
  INCIDENT_SLA_HOURS,
  openIncident,
} from '@/domains/incidents/actions'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createActiveProduct,
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'
import { IncidentStatus, IncidentType, OrderStatus } from '@/generated/prisma/enums'

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

async function createOrderInStatus(customerId: string, status: OrderStatus) {
  const order = await db.order.create({
    data: {
      orderNumber: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId,
      status,
      paymentStatus: 'SUCCEEDED',
      subtotal: 25,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 25,
    },
  })
  return order
}

test('openIncident creates an OPEN incident with a 72h SLA on a delivered order', async () => {
  const customer = await createUser('CUSTOMER')
  const order = await createOrderInStatus(customer.id, 'DELIVERED')
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  const before = Date.now()
  const { incidentId } = await openIncident({
    orderId: order.id,
    type: IncidentType.ITEM_DAMAGED,
    description: 'Llegó roto, faltan piezas dentro del paquete.',
  })
  const after = Date.now()

  const incident = await db.incident.findUniqueOrThrow({ where: { id: incidentId } })
  assert.equal(incident.status, IncidentStatus.OPEN)
  assert.equal(incident.customerId, customer.id)
  assert.equal(incident.orderId, order.id)

  // SLA must land within [72h-since-before, 72h-since-after].
  const slaMs = incident.slaDeadline.getTime()
  const expectedMin = before + INCIDENT_SLA_HOURS * 60 * 60 * 1000
  const expectedMax = after + INCIDENT_SLA_HOURS * 60 * 60 * 1000
  assert.ok(slaMs >= expectedMin && slaMs <= expectedMax, 'slaDeadline ≈ now + 72h')
})

test('openIncident accepts SHIPPED and PARTIALLY_SHIPPED orders too', async () => {
  const customer = await createUser('CUSTOMER')
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  for (const status of ['SHIPPED', 'PARTIALLY_SHIPPED'] as OrderStatus[]) {
    const order = await createOrderInStatus(customer.id, status)
    await assert.doesNotReject(() =>
      openIncident({
        orderId: order.id,
        type: IncidentType.ITEM_NOT_RECEIVED,
        description: `Pedido ${status}: el seguimiento no avanza.`,
      })
    )
  }
})

test('openIncident rejects orders not yet shipped', async () => {
  const customer = await createUser('CUSTOMER')
  const order = await createOrderInStatus(customer.id, 'PLACED')
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  await assert.rejects(
    () =>
      openIncident({
        orderId: order.id,
        type: IncidentType.OTHER,
        description: 'Algo no va bien con este pedido y ya quiero abrir un caso.',
      }),
    IncidentValidationError
  )
})

test('openIncident refuses to open a case on someone else order (cross-tenant)', async () => {
  const customerA = await createUser('CUSTOMER')
  const customerB = await createUser('CUSTOMER')
  const orderForA = await createOrderInStatus(customerA.id, 'DELIVERED')

  // B is logged in but is trying to open an incident on A's order.
  useTestSession(buildSession(customerB.id, 'CUSTOMER'))

  await assert.rejects(
    () =>
      openIncident({
        orderId: orderForA.id,
        type: IncidentType.QUALITY_ISSUE,
        description: 'Este pedido no es mío pero quiero meter cizaña.',
      }),
    IncidentAuthError
  )
})

test('addIncidentMessage lets the owner reply but rejects strangers', async () => {
  const customer = await createUser('CUSTOMER')
  const stranger = await createUser('CUSTOMER')
  const order = await createOrderInStatus(customer.id, 'DELIVERED')
  useTestSession(buildSession(customer.id, 'CUSTOMER'))
  const { incidentId } = await openIncident({
    orderId: order.id,
    type: IncidentType.WRONG_ITEM,
    description: 'Me han enviado el producto equivocado.',
  })

  // Owner can post.
  const { messageId } = await addIncidentMessage({
    incidentId,
    body: 'Adjunto fotos del producto recibido.',
  })
  const message = await db.incidentMessage.findUniqueOrThrow({ where: { id: messageId } })
  assert.equal(message.authorId, customer.id)
  assert.equal(message.authorRole, 'CUSTOMER')

  // Stranger cannot — same not-found error as a missing incident, no info leak.
  useTestSession(buildSession(stranger.id, 'CUSTOMER'))
  await assert.rejects(
    () => addIncidentMessage({ incidentId, body: 'Hola, soy un intruso.' }),
    IncidentAuthError
  )
})

test('addIncidentMessage rejects messages on closed incidents', async () => {
  const customer = await createUser('CUSTOMER')
  const order = await createOrderInStatus(customer.id, 'DELIVERED')
  useTestSession(buildSession(customer.id, 'CUSTOMER'))
  const { incidentId } = await openIncident({
    orderId: order.id,
    type: IncidentType.MISSING_ITEMS,
    description: 'Falta un artículo del pedido.',
  })

  await db.incident.update({
    where: { id: incidentId },
    data: { status: IncidentStatus.CLOSED, resolvedAt: new Date() },
  })

  await assert.rejects(
    () => addIncidentMessage({ incidentId, body: 'Quiero reabrir esto.' }),
    IncidentValidationError
  )
})

test('getMyIncidents returns only the authenticated buyer incidents, newest first', async () => {
  const customerA = await createUser('CUSTOMER')
  const customerB = await createUser('CUSTOMER')
  const orderA1 = await createOrderInStatus(customerA.id, 'DELIVERED')
  const orderA2 = await createOrderInStatus(customerA.id, 'DELIVERED')
  const orderB = await createOrderInStatus(customerB.id, 'DELIVERED')

  useTestSession(buildSession(customerA.id, 'CUSTOMER'))
  await openIncident({ orderId: orderA1.id, type: IncidentType.OTHER, description: 'Caso A1.' })
  await openIncident({ orderId: orderA2.id, type: IncidentType.OTHER, description: 'Caso A2.' })

  useTestSession(buildSession(customerB.id, 'CUSTOMER'))
  await openIncident({ orderId: orderB.id, type: IncidentType.OTHER, description: 'Caso B.' })

  // A only sees A's two incidents.
  useTestSession(buildSession(customerA.id, 'CUSTOMER'))
  const list = await getMyIncidents()
  assert.equal(list.length, 2)
  assert.deepEqual(
    new Set(list.map(i => i.order.id)),
    new Set([orderA1.id, orderA2.id])
  )

  // Newest-first ordering.
  assert.ok(list[0].createdAt.getTime() >= list[1].createdAt.getTime())
})

test('getMyIncidents flags overdue items via slaOverdue', async () => {
  const customer = await createUser('CUSTOMER')
  const order = await createOrderInStatus(customer.id, 'DELIVERED')
  useTestSession(buildSession(customer.id, 'CUSTOMER'))
  const { incidentId } = await openIncident({
    orderId: order.id,
    type: IncidentType.OTHER,
    description: 'Algo pasó y no sé qué.',
  })

  // Backdate the SLA so it's overdue.
  await db.incident.update({
    where: { id: incidentId },
    data: { slaDeadline: new Date(Date.now() - 60 * 1000) },
  })

  const [incident] = await getMyIncidents()
  assert.equal(incident.slaOverdue, true)
})

test('getIncidentDetail returns the thread for the owner and rejects strangers', async () => {
  const customer = await createUser('CUSTOMER')
  const stranger = await createUser('CUSTOMER')
  const order = await createOrderInStatus(customer.id, 'DELIVERED')
  useTestSession(buildSession(customer.id, 'CUSTOMER'))
  const { incidentId } = await openIncident({
    orderId: order.id,
    type: IncidentType.QUALITY_ISSUE,
    description: 'La calidad no es la prometida.',
  })
  await addIncidentMessage({ incidentId, body: 'Adjunto fotos.' })

  // Owner sees it with messages.
  const detail = await getIncidentDetail(incidentId)
  assert.equal(detail.id, incidentId)
  assert.equal(detail.messages.length, 1)
  assert.equal(detail.messages[0].body, 'Adjunto fotos.')

  // Stranger sees not-found.
  useTestSession(buildSession(stranger.id, 'CUSTOMER'))
  await assert.rejects(() => getIncidentDetail(incidentId), IncidentAuthError)
})

// `createActiveProduct` and `createVendorUser` are imported above to keep the
// helper surface aligned with other integration tests, even though this file
// doesn't strictly need a vendor — the orders here are bare-bones because we
// only care about status transitions, not the cart.
void createActiveProduct
void createVendorUser
