import test from 'node:test'
import assert from 'node:assert/strict'
import { GET } from '../../src/app/api/cron/cleanup-idempotency/route'

// Auth contract test for the cron route. We can't easily test the
// Prisma cleanup itself without a live DB, but we CAN verify that
// the auth gate rejects unauthenticated callers — that's the high-risk
// path (anyone hitting the endpoint without a secret).
//
// The route reads `process.env.CRON_SECRET` at request time (not at
// import time), so we can mutate the env per test without re-importing.

const ORIGINAL_SECRET = process.env.CRON_SECRET

test('GET without any auth header returns 401', async () => {
  delete process.env.CRON_SECRET
  const res = await GET(new Request('http://localhost/api/cron/cleanup-idempotency'))
  assert.equal(res.status, 401)
})

test('GET with wrong Bearer token returns 401', async () => {
  process.env.CRON_SECRET = 'expected-secret'
  const res = await GET(
    new Request('http://localhost/api/cron/cleanup-idempotency', {
      headers: { authorization: 'Bearer wrong-token' },
    }),
  )
  assert.equal(res.status, 401)
})

test('GET with x-vercel-cron header but no Bearer is REJECTED (#1150)', async () => {
  // The previous bypass let any caller fire cron jobs by setting the
  // header, because Cloudflare Tunnel does not strip arbitrary client
  // headers. Now Bearer CRON_SECRET is the only path; the header has
  // no auth value.
  delete process.env.CRON_SECRET
  const res = await GET(
    new Request('http://localhost/api/cron/cleanup-idempotency', {
      headers: { 'x-vercel-cron': '1' },
    }),
  )
  assert.equal(res.status, 401, 'x-vercel-cron alone must not authorize the cron')
})

test('GET with x-vercel-cron AND wrong Bearer is REJECTED (#1150)', async () => {
  process.env.CRON_SECRET = 'expected-secret'
  const res = await GET(
    new Request('http://localhost/api/cron/cleanup-idempotency', {
      headers: {
        'x-vercel-cron': '1',
        authorization: 'Bearer wrong-token',
      },
    }),
  )
  assert.equal(res.status, 401, 'x-vercel-cron must not bypass a wrong Bearer')
})

// Restore env at the end so other test files in the same runner aren't affected.
test.after?.(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL_SECRET
})
