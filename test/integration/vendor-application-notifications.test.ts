import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { approveVendor, rejectVendor } from '@/domains/admin/actions'
import { applyAsVendor } from '@/domains/vendors/apply'
import {
  buildSession,
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

const ORIG_FETCH = globalThis.fetch
const ORIG_ENV = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
}

function mockTelegramFetch() {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch
}

async function flushNotifications() {
  for (let i = 0; i < 80; i++) {
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

beforeEach(async () => {
  await resetIntegrationDatabase()
  process.env.TELEGRAM_BOT_TOKEN = 'test-token'
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret'
  process.env.TELEGRAM_BOT_USERNAME = 'test_bot'
  process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
  mockTelegramFetch()
})

afterEach(() => {
  globalThis.fetch = ORIG_FETCH
  process.env.TELEGRAM_BOT_TOKEN = ORIG_ENV.TELEGRAM_BOT_TOKEN
  process.env.TELEGRAM_WEBHOOK_SECRET = ORIG_ENV.TELEGRAM_WEBHOOK_SECRET
  process.env.TELEGRAM_BOT_USERNAME = ORIG_ENV.TELEGRAM_BOT_USERNAME
  process.env.NEXT_PUBLIC_APP_URL = ORIG_ENV.NEXT_PUBLIC_APP_URL
  clearTestSession()
})

test('approveVendor sends a buyer Telegram notification for the applicant', async () => {
  const applicant = await createUser('CUSTOMER')
  useTestSession(buildSession(applicant.id, 'CUSTOMER'))
  const apply = await applyAsVendor({ displayName: 'Quesería Los Olmos' })
  assert.equal(apply.ok, true)
  const vendorId = apply.ok ? apply.vendorId : ''

  await db.telegramLink.create({
    data: {
      userId: applicant.id,
      chatId: '123456',
      username: 'applicant_bot',
      isActive: true,
    },
  })

  const admin = await createUser('SUPERADMIN')
  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  await approveVendor(vendorId)
  await flushNotifications()

  const delivery = await db.notificationDelivery.findFirst({
    where: {
      userId: applicant.id,
      channel: 'TELEGRAM',
      eventType: 'BUYER_VENDOR_APPLICATION_APPROVED',
    },
    orderBy: { createdAt: 'desc' },
  })

  assert.ok(delivery, 'approval should emit a Telegram delivery row')
  assert.equal(delivery?.status, 'SENT')
  assert.equal(delivery?.payloadRef, `vendor:${vendorId}`)
})

test('rejectVendor sends a buyer Telegram notification for the applicant', async () => {
  const applicant = await createUser('CUSTOMER')
  useTestSession(buildSession(applicant.id, 'CUSTOMER'))
  const apply = await applyAsVendor({ displayName: 'Granja Dudosa' })
  assert.equal(apply.ok, true)
  const vendorId = apply.ok ? apply.vendorId : ''

  await db.telegramLink.create({
    data: {
      userId: applicant.id,
      chatId: '123457',
      username: 'applicant_bot',
      isActive: true,
    },
  })

  const admin = await createUser('SUPERADMIN')
  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  await rejectVendor(vendorId)
  await flushNotifications()

  const delivery = await db.notificationDelivery.findFirst({
    where: {
      userId: applicant.id,
      channel: 'TELEGRAM',
      eventType: 'BUYER_VENDOR_APPLICATION_REJECTED',
    },
    orderBy: { createdAt: 'desc' },
  })

  assert.ok(delivery, 'rejection should emit a Telegram delivery row')
  assert.equal(delivery?.status, 'SENT')
  assert.equal(delivery?.payloadRef, `vendor:${vendorId}`)
})
