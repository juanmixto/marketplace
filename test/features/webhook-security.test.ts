/**
 * Security tests for the Stripe webhook route guards.
 *
 * These tests cover:
 * - isMockWebhookAllowed: prevents mock mode from being exploited in production
 * - getWebhookIdempotencyKey: stable key extraction for dedup
 *
 * The signature verification itself (stripe.webhooks.constructEvent) is a
 * Stripe SDK concern and is tested by Stripe's own test suite. We trust it
 * and focus on the guards we own.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { isMockWebhookAllowed, getWebhookIdempotencyKey } from '@/domains/payments/webhook'

// ─── isMockWebhookAllowed ─────────────────────────────────────────────────────

test('isMockWebhookAllowed: allows mock events in development', () => {
  assert.equal(isMockWebhookAllowed('mock', 'development'), true)
})

test('isMockWebhookAllowed: allows mock events in test environment', () => {
  assert.equal(isMockWebhookAllowed('mock', 'test'), true)
})

test('isMockWebhookAllowed: BLOCKS mock events in production', () => {
  assert.equal(isMockWebhookAllowed('mock', 'production'), false)
})

test('isMockWebhookAllowed: returns false when provider is stripe (not mock)', () => {
  assert.equal(isMockWebhookAllowed('stripe', 'development'), false)
  assert.equal(isMockWebhookAllowed('stripe', 'production'), false)
})

test('isMockWebhookAllowed: treats unknown environments as production-safe (deny)', () => {
  // Any NODE_ENV outside the dev/test allowlist must fail closed. A
  // custom 'staging' deploy was previously allowed (bypassed Stripe
  // signature verification) — the allowlist shuts that path.
  assert.equal(isMockWebhookAllowed('mock', 'staging'), false)
  assert.equal(isMockWebhookAllowed('mock', 'preview'), false)
  assert.equal(isMockWebhookAllowed('mock', ''), false)
})

// ─── getWebhookIdempotencyKey ─────────────────────────────────────────────────

test('getWebhookIdempotencyKey: returns the event id as-is when present', () => {
  assert.equal(getWebhookIdempotencyKey('evt_1ABC'), 'evt_1ABC')
})

test('getWebhookIdempotencyKey: returns null for undefined event ids (mock events)', () => {
  assert.equal(getWebhookIdempotencyKey(undefined), null)
})

test('getWebhookIdempotencyKey: two events with the same id produce the same key', () => {
  const key1 = getWebhookIdempotencyKey('evt_SAME')
  const key2 = getWebhookIdempotencyKey('evt_SAME')
  assert.equal(key1, key2)
})

test('getWebhookIdempotencyKey: different event ids produce different keys', () => {
  assert.notEqual(
    getWebhookIdempotencyKey('evt_AAA'),
    getWebhookIdempotencyKey('evt_BBB')
  )
})
