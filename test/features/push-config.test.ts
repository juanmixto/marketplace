import test from 'node:test'
import assert from 'node:assert/strict'

test('push-config: isPushEnabled is false when VAPID keys are absent', async () => {
  // Clear env to simulate unconfigured state.
  const savedPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const savedPrivate = process.env.VAPID_PRIVATE_KEY
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  delete process.env.VAPID_PRIVATE_KEY

  // Re-import to get fresh module evaluation.
  // Node caches modules, so we use a query-string trick to bust the cache.
  const mod = await import(`@/lib/pwa/push-config?t=${Date.now()}`)
  assert.equal(mod.isPushEnabled, false)
  assert.equal(mod.vapidConfig, null)

  // Restore.
  if (savedPublic) process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = savedPublic
  if (savedPrivate) process.env.VAPID_PRIVATE_KEY = savedPrivate
})

test('push-config: exports VapidConfig type structure', async () => {
  // Set fake keys.
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BFakePublicKey123'
  process.env.VAPID_PRIVATE_KEY = 'FakePrivateKey456'
  process.env.NEXT_PUBLIC_APP_URL = 'https://test.example.com'

  const mod = await import(`@/lib/pwa/push-config?t=${Date.now() + 1}`)
  assert.equal(mod.isPushEnabled, true)
  assert.ok(mod.vapidConfig !== null)
  assert.equal(mod.vapidConfig!.publicKey, 'BFakePublicKey123')
  assert.equal(mod.vapidConfig!.privateKey, 'FakePrivateKey456')
  assert.equal(mod.vapidConfig!.subject, 'https://test.example.com')

  // Cleanup.
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  delete process.env.VAPID_PRIVATE_KEY
})
