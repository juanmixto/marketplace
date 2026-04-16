import test from 'node:test'
import assert from 'node:assert/strict'
import {
  orderLineSnapshotSchema,
  orderAddressSnapshotSchema,
  parseOrderAddressSnapshot,
} from '@/shared/types/snapshots'

/**
 * Phase 5 of the contract-hardening plan.
 *
 * Locks down the JSON-snapshot versioning behavior so a future v2
 * schema can be introduced without breaking reads of v1 rows already
 * sitting in the database.
 */

test('orderLineSnapshotSchema parses legacy rows (no version field) as v1', () => {
  const legacy = {
    id: 'prod_123',
    name: 'Aceite de oliva',
    slug: 'aceite-oliva',
    images: ['/img/oil.jpg'],
    unit: 'L',
    vendorName: 'Olivar Andaluz',
    variantName: '500ml',
  }
  const parsed = orderLineSnapshotSchema.parse(legacy)
  assert.equal(parsed.version, 1)
  assert.equal(parsed.id, 'prod_123')
  assert.equal(parsed.variantName, '500ml')
})

test('orderLineSnapshotSchema parses explicit v1 rows (round-trip)', () => {
  const v1 = {
    version: 1 as const,
    id: 'prod_456',
    name: 'Queso curado',
    slug: 'queso-curado',
    images: [],
    unit: 'kg',
    vendorName: 'Quesería',
  }
  const parsed = orderLineSnapshotSchema.parse(v1)
  assert.equal(parsed.version, 1)
  assert.equal(parsed.images.length, 0)
  assert.equal(parsed.variantName, undefined)
})

test('orderAddressSnapshotSchema parses legacy rows as v1', () => {
  const legacy = {
    firstName: 'Ana',
    lastName: 'García',
    line1: 'Calle Mayor 1',
    city: 'Madrid',
    province: 'Madrid',
    postalCode: '28001',
  }
  const parsed = orderAddressSnapshotSchema.parse(legacy)
  assert.equal(parsed.version, 1)
  assert.equal(parsed.firstName, 'Ana')
  assert.equal(parsed.line2, undefined)
  assert.equal(parsed.phone, undefined)
})

test('parseOrderAddressSnapshot returns the parsed object on legacy rows', () => {
  const legacy = {
    firstName: 'Luis',
    lastName: 'Soto',
    line1: 'Av. de la Paz 12',
    city: 'Sevilla',
    province: 'Sevilla',
    postalCode: '41001',
  }
  const parsed = parseOrderAddressSnapshot(legacy)
  assert.ok(parsed)
  assert.equal(parsed!.version, 1)
})

test('parseOrderAddressSnapshot returns null for malformed payloads', () => {
  // Missing required field `city`.
  const malformed = {
    firstName: 'X',
    lastName: 'Y',
    line1: 'Z',
    province: 'Madrid',
    postalCode: '28001',
  }
  const parsed = parseOrderAddressSnapshot(malformed)
  assert.equal(parsed, null)
})

test('snapshot schemas reject foreign version values', () => {
  // A row written by a future v2 producer must not silently coerce to
  // v1; the literal(1) on the v1 schema rejects anything that is not 1.
  const futureRow = {
    version: 2,
    id: 'p',
    name: 'p',
    slug: 'p',
    images: [],
    unit: 'L',
    vendorName: 'v',
  }
  const result = orderLineSnapshotSchema.safeParse(futureRow)
  assert.equal(result.success, false)
})
