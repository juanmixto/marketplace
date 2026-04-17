import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { GET, POST } from '@/app/api/direcciones/route'
import { PUT as PUT_BY_ID, DELETE as DELETE_BY_ID } from '@/app/api/direcciones/[id]/route'
import { PUT as PUT_DEFAULT } from '@/app/api/direcciones/[id]/predeterminada/route'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

async function createAddress(userId: string, isDefault = false) {
  return db.address.create({
    data: {
      userId,
      firstName: 'Tester',
      lastName: 'Owner',
      line1: 'Calle Falsa 123',
      city: 'Madrid',
      province: 'Madrid',
      postalCode: '28001',
      isDefault,
    },
  })
}

function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init) as Parameters<typeof PUT_BY_ID>[0]
}

test('GET /api/direcciones returns only the authenticated user addresses', async () => {
  const buyerA = await createUser('CUSTOMER')
  const buyerB = await createUser('CUSTOMER')
  await createAddress(buyerA.id, true)
  const ownB = await createAddress(buyerB.id, true)

  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))
  const res = await GET(makeRequest('http://localhost/api/direcciones'))
  assert.equal(res.status, 200)
  const body = (await res.json()) as Array<{ id: string; userId: string }>
  assert.equal(body.length, 1)
  assert.equal(body[0].id, ownB.id)
  assert.equal(body[0].userId, buyerB.id)
})

test('PUT /api/direcciones/[id] returns 404 when the address belongs to another buyer', async () => {
  const buyerA = await createUser('CUSTOMER')
  const buyerB = await createUser('CUSTOMER')
  const addressA = await createAddress(buyerA.id)

  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))
  const res = await PUT_BY_ID(
    makeRequest(`http://localhost/api/direcciones/${addressA.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        firstName: 'Hijack',
        lastName: 'Attempt',
        line1: 'Otra calle 1',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28002',
        isDefault: false,
      }),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ id: addressA.id }) }
  )
  assert.equal(res.status, 404)

  const stored = await db.address.findUnique({ where: { id: addressA.id } })
  assert.equal(stored?.firstName, 'Tester')
  assert.equal(stored?.line1, 'Calle Falsa 123')
})

test('DELETE /api/direcciones/[id] returns 404 when the address belongs to another buyer', async () => {
  const buyerA = await createUser('CUSTOMER')
  const buyerB = await createUser('CUSTOMER')
  const addressA = await createAddress(buyerA.id)

  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))
  const res = await DELETE_BY_ID(
    makeRequest(`http://localhost/api/direcciones/${addressA.id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: addressA.id }) }
  )
  assert.equal(res.status, 404)

  const stored = await db.address.findUnique({ where: { id: addressA.id } })
  assert.ok(stored, 'address must still exist after rejected cross-buyer delete')
})

test('PUT /api/direcciones/[id]/predeterminada returns 404 for cross-buyer set-default', async () => {
  const buyerA = await createUser('CUSTOMER')
  const buyerB = await createUser('CUSTOMER')
  const addressA = await createAddress(buyerA.id, false)
  await createAddress(buyerB.id, true)

  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))
  const res = await PUT_DEFAULT(
    makeRequest(`http://localhost/api/direcciones/${addressA.id}/predeterminada`, { method: 'PUT' }),
    { params: Promise.resolve({ id: addressA.id }) }
  )
  assert.equal(res.status, 404)

  const stored = await db.address.findUnique({ where: { id: addressA.id } })
  assert.equal(stored?.isDefault, false)
})

test('legitimate owner can still update + delete + set-default their own address', async () => {
  const buyer = await createUser('CUSTOMER')
  const address = await createAddress(buyer.id, false)

  useTestSession(buildSession(buyer.id, 'CUSTOMER'))

  const updateRes = await PUT_BY_ID(
    makeRequest(`http://localhost/api/direcciones/${address.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        firstName: 'Updated',
        lastName: 'Owner',
        line1: 'Calle Nueva 9',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28010',
        isDefault: true,
      }),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ id: address.id }) }
  )
  assert.equal(updateRes.status, 200)

  const setDefaultRes = await PUT_DEFAULT(
    makeRequest(`http://localhost/api/direcciones/${address.id}/predeterminada`, { method: 'PUT' }),
    { params: Promise.resolve({ id: address.id }) }
  )
  assert.equal(setDefaultRes.status, 200)

  const deleteRes = await DELETE_BY_ID(
    makeRequest(`http://localhost/api/direcciones/${address.id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: address.id }) }
  )
  assert.equal(deleteRes.status, 200)
  const gone = await db.address.findUnique({ where: { id: address.id } })
  assert.equal(gone, null)
})

test('POST /api/direcciones always assigns userId from the session, ignoring any client-provided userId', async () => {
  const buyer = await createUser('CUSTOMER')
  const stranger = await createUser('CUSTOMER')

  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const res = await POST(
    makeRequest('http://localhost/api/direcciones', {
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Owner',
        lastName: 'Pwn',
        line1: 'Calle Test 1',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
        isDefault: false,
        // Schema strips this, but we assert on the persisted row anyway.
        userId: stranger.id,
      }),
      headers: { 'content-type': 'application/json' },
    })
  )
  assert.equal(res.status, 201)
  const created = (await res.json()) as { id: string; userId: string }
  assert.equal(created.userId, buyer.id)
})
