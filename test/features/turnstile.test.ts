import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { verifyTurnstileToken, isTurnstileConfigured } from '@/lib/turnstile'

/**
 * Issue #1273.
 *
 * Cloudflare Turnstile server-side verification helper.
 *
 * The two contracts we test here:
 *   1. Fail-open by env: no `TURNSTILE_SECRET_KEY` ⇒ verify returns
 *      `{ ok: true }` regardless of token. This is what makes the
 *      change deployable BEFORE ops provisions the secret.
 *   2. Once configured, missing/empty/oversized tokens fail BEFORE
 *      the network call (cheap rejection on the obvious cases).
 *
 * We don't test the live siteverify call here; that's covered by an
 * opt-in integration check (RUN_LIVE_TURNSTILE=1 + a real test secret).
 */

const ORIGINAL_ENV = process.env.TURNSTILE_SECRET_KEY

beforeEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY
})

afterEach(() => {
  if (ORIGINAL_ENV !== undefined) {
    process.env.TURNSTILE_SECRET_KEY = ORIGINAL_ENV
  } else {
    delete process.env.TURNSTILE_SECRET_KEY
  }
})

test('isTurnstileConfigured reports false when secret is unset', () => {
  assert.equal(isTurnstileConfigured(), false)
})

test('isTurnstileConfigured reports true when secret is set', () => {
  process.env.TURNSTILE_SECRET_KEY = '0x4AAAAAAATestSecretKey'
  assert.equal(isTurnstileConfigured(), true)
})

test('verifyTurnstileToken returns ok:true when secret is unset (fail-open by env)', async () => {
  const r = await verifyTurnstileToken('any-token-or-none')
  assert.deepEqual(r, { ok: true })
})

test('verifyTurnstileToken returns ok:true when secret is unset and token is null', async () => {
  const r = await verifyTurnstileToken(null)
  assert.deepEqual(r, { ok: true })
})

test('verifyTurnstileToken returns ok:false when secret is set but token is missing', async () => {
  process.env.TURNSTILE_SECRET_KEY = '0x4AAAAAAATestSecretKey'
  const r = await verifyTurnstileToken(undefined)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'missing-token')
})

test('verifyTurnstileToken returns ok:false when secret is set but token is empty string', async () => {
  process.env.TURNSTILE_SECRET_KEY = '0x4AAAAAAATestSecretKey'
  const r = await verifyTurnstileToken('')
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'missing-token')
})

test('verifyTurnstileToken refuses oversized tokens before the network call', async () => {
  process.env.TURNSTILE_SECRET_KEY = '0x4AAAAAAATestSecretKey'
  // Cloudflare tokens are ~600 chars; 3000 is unambiguously bogus.
  const r = await verifyTurnstileToken('x'.repeat(3000))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'token-too-long')
})
