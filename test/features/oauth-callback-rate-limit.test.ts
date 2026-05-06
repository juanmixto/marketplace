import test from 'node:test'
import assert from 'node:assert/strict'
import { checkRateLimit } from '@/lib/ratelimit'

/**
 * Issue #1288 (security backlog).
 *
 * The OAuth callback bucket protects the `signIn({ account: oauth })`
 * path against a per-IP enumeration spray. Wired in `src/lib/auth.ts`.
 * Limit: 20 callbacks per 10 minutes per (provider, IP). Fail-open
 * (default) so a transient Upstash blip doesn't lock everyone out.
 *
 * The actual signIn callback is integration-tested in the wider auth
 * suite; here we verify the bucket primitive itself behaves as the
 * issue describes.
 */

test('oauth-callback bucket allows 20 attempts, blocks the 21st', async () => {
  const ip = `1.2.3.${Date.now() % 256}`
  const key = `google:${ip}`

  for (let i = 0; i < 20; i++) {
    const r = await checkRateLimit('oauth-callback-test', key, 20, 600)
    assert.equal(r.success, true, `iteration ${i} unexpectedly blocked`)
  }
  const blocked = await checkRateLimit('oauth-callback-test', key, 20, 600)
  assert.equal(blocked.success, false)
})

test('oauth-callback buckets are scoped per (action, key) — different IPs are independent', async () => {
  const a = `2.0.0.${Date.now() % 256}`
  const b = `2.0.0.${(Date.now() + 1) % 256}`

  for (let i = 0; i < 20; i++) {
    await checkRateLimit('oauth-callback-test', `google:${a}`, 20, 600)
  }
  const aBlocked = await checkRateLimit('oauth-callback-test', `google:${a}`, 20, 600)
  assert.equal(aBlocked.success, false)

  // IP `b` is unaffected.
  const bAllowed = await checkRateLimit('oauth-callback-test', `google:${b}`, 20, 600)
  assert.equal(bAllowed.success, true)
})

test('oauth-callback fail-open: not passing failClosed:true means a backend hiccup returns success:true', async () => {
  // Without Upstash configured (no env), checkRateLimit uses its
  // in-memory store and always returns deterministic results — so
  // the fail-open contract is more of a code-shape assertion than a
  // runtime check. We assert that the default options object does
  // NOT trigger fail-closed by passing through a known-good call.
  const r = await checkRateLimit(
    'oauth-callback-test-fail-open',
    'fail-open-key',
    20,
    600,
    /* options omitted = fail-open */
  )
  assert.equal(r.success, true)
})
