import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatExpirationDateInput,
  formatExpirationLabel,
  getAvailableProductWhere,
  getExpirationTone,
  isProductExpired,
  parseExpirationDateInput,
} from '@/domains/catalog/availability'

test('getAvailableProductWhere excludes expired products from storefront queries', () => {
  const now = new Date('2026-04-08T12:00:00.000Z')
  const where = getAvailableProductWhere(now)

  assert.deepEqual(where, {
    status: 'ACTIVE',
    deletedAt: null,
    OR: [
      { expiresAt: null },
      { expiresAt: { gt: now } },
    ],
  })
})

test('expiration helpers classify expired and expiring products', () => {
  const now = new Date('2026-04-08T12:00:00.000Z')

  assert.equal(isProductExpired('2026-04-08T11:59:59.000Z', now), true)
  assert.equal(getExpirationTone('2026-04-08T23:59:59.999Z', now), 'today')
  assert.equal(getExpirationTone('2026-04-10T23:59:59.999Z', now), 'soon')
  assert.equal(getExpirationTone('2026-04-20T23:59:59.999Z', now), 'scheduled')
  assert.equal(formatExpirationLabel('2026-04-08T10:00:00.000Z', now), 'Caducado el 8 abr 2026')
})

test('expiration date inputs round-trip through form-friendly values', () => {
  const expiresAt = parseExpirationDateInput('2026-04-30')

  assert.equal(expiresAt?.toISOString(), '2026-04-30T23:59:59.999Z')
  assert.equal(formatExpirationDateInput(expiresAt), '2026-04-30')
})
