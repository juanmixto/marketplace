import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { DELETE as DELETE_ACCOUNT } from '@/app/api/account/delete/route'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * Issue #1350 (epic #1346 — PII pre-launch).
 *
 * Pre-#1350 the GDPR Art.17 transaction only touched User / Address /
 * Review / Session. A "deleted" user kept its OAuth tokens, push
 * endpoints, telegram chat ids and cart history live on the now-
 * anonimized User row — auditable as a residual-PII finding.
 *
 * This suite asserts the extended cascade plus the AuditLog row that
 * makes self-erasure traceable.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

function deleteRequest(body: unknown = {}) {
  return new Request('http://localhost/api/account/delete', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as Parameters<typeof DELETE_ACCOUNT>[0]
}

async function createBuyerWithPII(password = 'secret-password-1') {
  const passwordHash = await bcrypt.hash(password, 4)
  const user = await db.user.create({
    data: {
      email: `buyer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
      passwordHash,
      firstName: 'Original',
      lastName: 'Name',
      role: 'CUSTOMER',
      isActive: true,
    },
  })

  await db.account.create({
    data: {
      userId: user.id,
      type: 'oauth',
      provider: 'google',
      providerAccountId: `google-${user.id}`,
      access_token: 'live-access-token',
      refresh_token: 'live-refresh-token',
      id_token: 'live-id-token',
      token_type: 'Bearer',
      scope: 'openid profile email',
    },
  })

  const product = await db.product.create({
    data: {
      slug: `prod-${user.id.slice(0, 8)}`,
      name: 'Test product',
      basePrice: '10.00',
      category: { connect: { id: 'cat_uncategorized' } },
      // a Vendor relation isn't needed for the cart-cascade assertion;
      // CartItem only needs a real Product row.
      vendor: {
        create: {
          slug: `v-${user.id.slice(0, 6)}`,
          displayName: 'Test vendor',
          status: 'ACTIVE',
          stripeOnboarded: true,
          stripeAccountId: `acct_${user.id.slice(0, 6)}`,
          user: {
            create: {
              email: `v-${user.id}@ex.invalid`,
              firstName: 'V',
              lastName: 'Tester',
              role: 'VENDOR',
              isActive: true,
            },
          },
        },
      },
    },
  })

  await db.cart.create({
    data: {
      userId: user.id,
      items: {
        create: {
          userId: user.id,
          productId: product.id,
          quantity: 2,
        },
      },
    },
  })

  await db.pushSubscription.create({
    data: {
      userId: user.id,
      endpoint: `https://push.example/${user.id}`,
      p256dh: 'p256-key',
      auth: 'auth-key',
      userAgent: 'Mozilla/5.0 (X11)',
    },
  })

  await db.telegramLink.create({
    data: {
      userId: user.id,
      chatId: `tg-${user.id}`,
      username: 'tg_handle',
    },
  })

  return { user, password }
}

test('DELETE /api/account/delete cascades Account / Cart / PushSubscription / TelegramLink', async () => {
  const { user, password } = await createBuyerWithPII()
  useTestSession(buildSession(user.id, 'CUSTOMER'))

  const res = await DELETE_ACCOUNT(deleteRequest({ password }))
  assert.equal(res.status, 200)

  // The User row is anonimized but kept (orders FK is RESTRICT — see
  // account-erase-fk-restrict.test.ts).
  const after = await db.user.findUniqueOrThrow({ where: { id: user.id } })
  assert.equal(after.firstName, 'Usuario')
  assert.equal(after.lastName, 'Eliminado')
  assert.notEqual(after.email, user.email)
  assert.match(after.email, /^deleted_.*@anon\.invalid$/)

  // Every PII satellite is gone.
  assert.equal(await db.account.count({ where: { userId: user.id } }), 0)
  assert.equal(await db.cart.count({ where: { userId: user.id } }), 0)
  assert.equal(await db.cartItem.count({ where: { userId: user.id } }), 0)
  assert.equal(await db.pushSubscription.count({ where: { userId: user.id } }), 0)
  assert.equal(await db.telegramLink.count({ where: { userId: user.id } }), 0)
  assert.equal(await db.session.count({ where: { userId: user.id } }), 0)
  assert.equal(await db.address.count({ where: { userId: user.id } }), 0)
})

test('DELETE /api/account/delete writes a USER_SELF_ERASED AuditLog row', async () => {
  const { user, password } = await createBuyerWithPII()
  useTestSession(buildSession(user.id, 'CUSTOMER'))

  const res = await DELETE_ACCOUNT(deleteRequest({ password }))
  assert.equal(res.status, 200)

  const auditRows = await db.auditLog.findMany({
    where: { entityType: 'User', entityId: user.id },
  })
  assert.equal(auditRows.length, 1, 'exactly one audit row per self-erasure')
  const [row] = auditRows
  assert.equal(row?.action, 'USER_SELF_ERASED')
  assert.equal(row?.actorId, user.id)
  assert.equal(row?.actorRole, 'CUSTOMER')
})

test('DELETE /api/account/delete is atomic: bad password leaves PII satellites intact', async () => {
  const { user } = await createBuyerWithPII()
  useTestSession(buildSession(user.id, 'CUSTOMER'))

  const res = await DELETE_ACCOUNT(deleteRequest({ password: 'wrong-password' }))
  assert.equal(res.status, 401)

  assert.equal(await db.account.count({ where: { userId: user.id } }), 1)
  assert.equal(await db.cart.count({ where: { userId: user.id } }), 1)
  assert.equal(await db.pushSubscription.count({ where: { userId: user.id } }), 1)
  assert.equal(await db.telegramLink.count({ where: { userId: user.id } }), 1)
  assert.equal(
    await db.auditLog.count({ where: { entityType: 'User', entityId: user.id } }),
    0,
  )

  // User row untouched.
  const after = await db.user.findUniqueOrThrow({ where: { id: user.id } })
  assert.equal(after.firstName, 'Original')
  assert.equal(after.email, user.email)
})
