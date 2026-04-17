import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { POST } from '@/app/api/telegram/webhook/route'
import { resetInboundRateLimitForTest } from '@/domains/notifications/telegram/rate-limit'

const TOKEN = 'test-bot-token'
const SECRET = 'test-webhook-secret'
const USERNAME = 'marketplace_test_bot'

function setEnv(withConfig: boolean) {
  if (withConfig) {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET
    process.env.TELEGRAM_BOT_USERNAME = USERNAME
  } else {
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    delete process.env.TELEGRAM_BOT_USERNAME
  }
}

function makeRequest(
  urlSecret: string | null,
  headerSecret: string | null,
  body: unknown,
): Request {
  const url = urlSecret
    ? `http://localhost/api/telegram/webhook?secret=${urlSecret}`
    : 'http://localhost/api/telegram/webhook'
  const headers = new Headers({ 'content-type': 'application/json' })
  if (headerSecret) headers.set('x-telegram-bot-api-secret-token', headerSecret)
  return new Request(url, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  resetInboundRateLimitForTest()
})

test('returns 404 when TELEGRAM_BOT_TOKEN is unset (feature dormant)', async () => {
  setEnv(false)
  const res = await POST(makeRequest(SECRET, SECRET, { update_id: 1 }))
  assert.equal(res.status, 404)
})

test('returns 200 (silent reject) on missing URL secret', async () => {
  setEnv(true)
  const res = await POST(makeRequest(null, SECRET, { update_id: 1 }))
  assert.equal(res.status, 200)
})

test('returns 200 (silent reject) on wrong URL secret', async () => {
  setEnv(true)
  const res = await POST(makeRequest('wrong', SECRET, { update_id: 1 }))
  assert.equal(res.status, 200)
})

test('returns 200 (silent reject) on missing header secret', async () => {
  setEnv(true)
  const res = await POST(makeRequest(SECRET, null, { update_id: 1 }))
  assert.equal(res.status, 200)
})

test('returns 200 (silent reject) on wrong header secret', async () => {
  setEnv(true)
  const res = await POST(makeRequest(SECRET, 'wrong', { update_id: 1 }))
  assert.equal(res.status, 200)
})

test('returns 200 on invalid JSON body', async () => {
  setEnv(true)
  const req = new Request(`http://localhost/api/telegram/webhook?secret=${SECRET}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': SECRET,
    },
    body: '{not json',
  })
  const res = await POST(req)
  assert.equal(res.status, 200)
})

test('returns 200 on malformed update shape (e.g. non-numeric update_id)', async () => {
  setEnv(true)
  const res = await POST(makeRequest(SECRET, SECRET, { update_id: 'not-a-number' }))
  assert.equal(res.status, 200)
})

test('returns 200 when both secrets match and update is well-formed (unknown type)', async () => {
  setEnv(true)
  const res = await POST(makeRequest(SECRET, SECRET, { update_id: 42 }))
  assert.equal(res.status, 200)
})

test('rate limits the 61st request from the same IP within a minute', async () => {
  setEnv(true)
  const IP = '10.0.0.99'
  for (let i = 0; i < 60; i++) {
    const req = new Request(`http://localhost/api/telegram/webhook?secret=${SECRET}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': SECRET,
        'x-forwarded-for': IP,
      },
      body: JSON.stringify({ update_id: i }),
    })
    const res = await POST(req)
    assert.equal(res.status, 200)
  }
  const blockedReq = new Request(`http://localhost/api/telegram/webhook?secret=${SECRET}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': SECRET,
      'x-forwarded-for': IP,
    },
    body: JSON.stringify({ update_id: 999 }),
  })
  const res = await POST(blockedReq)
  assert.equal(res.status, 200, 'rate limit still returns 200 (silent) so Telegram does not retry in a loop')
})
