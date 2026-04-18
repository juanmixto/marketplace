import test from 'node:test'
import assert from 'node:assert/strict'
import { mapSendcloudStatusStrict } from '@/domains/shipping/providers/sendcloud/mapper'

/**
 * Strict mapper contract for #568. The webhook path must NOT silently
 * coerce unknown provider status ids to LABEL_CREATED — doing so masks
 * provider-side contract drift and leaves buyers seeing a stale state.
 */

test('mapSendcloudStatusStrict returns null for unknown ids', () => {
  assert.equal(mapSendcloudStatusStrict(999_999), null)
  assert.equal(mapSendcloudStatusStrict(-1), null)
  assert.equal(mapSendcloudStatusStrict(0), null)
})

test('mapSendcloudStatusStrict resolves known ids the same as the permissive variant', () => {
  assert.equal(mapSendcloudStatusStrict(999), 'LABEL_CREATED')
  assert.equal(mapSendcloudStatusStrict(1000), 'LABEL_CREATED')
  assert.equal(mapSendcloudStatusStrict(1500), 'IN_TRANSIT')
  assert.equal(mapSendcloudStatusStrict(1800), 'OUT_FOR_DELIVERY')
  assert.equal(mapSendcloudStatusStrict(11), 'DELIVERED')
  assert.equal(mapSendcloudStatusStrict(80), 'EXCEPTION')
  assert.equal(mapSendcloudStatusStrict(2000), 'CANCELLED')
})
