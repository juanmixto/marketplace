import test from 'node:test'
import assert from 'node:assert/strict'
import { loadVapidConfig } from '@/lib/pwa/push-config'

test('loadVapidConfig: returns null when VAPID keys are absent', () => {
  const savedPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const savedPrivate = process.env.VAPID_PRIVATE_KEY
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  delete process.env.VAPID_PRIVATE_KEY

  const result = loadVapidConfig()
  assert.equal(result, null)

  // Restore.
  if (savedPublic) process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = savedPublic
  if (savedPrivate) process.env.VAPID_PRIVATE_KEY = savedPrivate
})

test('loadVapidConfig: returns config when both keys are set', () => {
  const savedPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const savedPrivate = process.env.VAPID_PRIVATE_KEY
  const savedUrl = process.env.NEXT_PUBLIC_APP_URL

  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BFakePublicKey123'
  process.env.VAPID_PRIVATE_KEY = 'FakePrivateKey456'
  process.env.NEXT_PUBLIC_APP_URL = 'https://test.example.com'

  const result = loadVapidConfig()
  assert.ok(result !== null)
  assert.equal(result!.publicKey, 'BFakePublicKey123')
  assert.equal(result!.privateKey, 'FakePrivateKey456')
  assert.equal(result!.subject, 'https://test.example.com')

  // Cleanup — restore original values.
  if (savedPublic) process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = savedPublic
  else delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (savedPrivate) process.env.VAPID_PRIVATE_KEY = savedPrivate
  else delete process.env.VAPID_PRIVATE_KEY
  if (savedUrl) process.env.NEXT_PUBLIC_APP_URL = savedUrl
  else delete process.env.NEXT_PUBLIC_APP_URL
})

test('loadVapidConfig: returns null when only public key is set', () => {
  const savedPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const savedPrivate = process.env.VAPID_PRIVATE_KEY

  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BFakePublicKey123'
  delete process.env.VAPID_PRIVATE_KEY

  const result = loadVapidConfig()
  assert.equal(result, null)

  if (savedPublic) process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = savedPublic
  else delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (savedPrivate) process.env.VAPID_PRIVATE_KEY = savedPrivate
})

test('loadVapidConfig: falls back to localhost when APP_URL is absent', () => {
  const savedPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const savedPrivate = process.env.VAPID_PRIVATE_KEY
  const savedUrl = process.env.NEXT_PUBLIC_APP_URL

  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BKey'
  process.env.VAPID_PRIVATE_KEY = 'PKey'
  delete process.env.NEXT_PUBLIC_APP_URL

  const result = loadVapidConfig()
  assert.ok(result !== null)
  assert.equal(result!.subject, 'http://localhost:3000')

  if (savedPublic) process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = savedPublic
  else delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (savedPrivate) process.env.VAPID_PRIVATE_KEY = savedPrivate
  else delete process.env.VAPID_PRIVATE_KEY
  if (savedUrl) process.env.NEXT_PUBLIC_APP_URL = savedUrl
})
