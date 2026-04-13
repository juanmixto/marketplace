import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { verifySendcloudSignature } from '@/domains/shipping/webhooks/signature'

const secret = 'test-secret-abc'

function sign(body: string, s = secret): string {
  return crypto.createHmac('sha256', s).update(body, 'utf8').digest('hex')
}

test('verifySendcloudSignature accepts a matching HMAC-SHA256 hex digest', () => {
  const body = '{"parcel":{"id":1,"status":{"id":1500,"message":"In transit"}}}'
  const sig = sign(body)
  assert.equal(verifySendcloudSignature(body, sig, secret), true)
})

test('verifySendcloudSignature rejects tampered bodies', () => {
  const body = '{"parcel":{"id":1}}'
  const sig = sign(body)
  const tampered = '{"parcel":{"id":2}}'
  assert.equal(verifySendcloudSignature(tampered, sig, secret), false)
})

test('verifySendcloudSignature rejects a missing signature header', () => {
  const body = '{"parcel":{"id":1}}'
  assert.equal(verifySendcloudSignature(body, null, secret), false)
})

test('verifySendcloudSignature rejects a signature of wrong length without throwing', () => {
  const body = '{"parcel":{"id":1}}'
  assert.equal(verifySendcloudSignature(body, 'deadbeef', secret), false)
})

test('verifySendcloudSignature rejects signatures produced with a different secret', () => {
  const body = '{"parcel":{"id":1}}'
  const sig = sign(body, 'other-secret')
  assert.equal(verifySendcloudSignature(body, sig, secret), false)
})
