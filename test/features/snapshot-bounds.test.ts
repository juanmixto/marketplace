import test from 'node:test'
import assert from 'node:assert/strict'
import {
  orderAddressSnapshotSchema,
  orderLineSnapshotSchema,
} from '@/shared/types/snapshots'

/**
 * Issue #1284 (epic #1192 / pre-launch hardening).
 *
 * `orderAddressSnapshotSchema` and `orderLineSnapshotSchema` parse
 * historical JSON columns (`Order.shippingAddressSnapshot`,
 * `OrderLine.productSnapshot`). Pre-#1284 every string field was
 * unbounded, so a row that grew past the original write-time
 * validator (manual SQL edit, column-level expansion) could render
 * megabytes of unbounded text into an admin UI / log line.
 *
 * Bounds match the source-of-truth column constraints. This suite
 * proves they reject the pathological case.
 */

test('orderAddressSnapshotSchema rejects line1 longer than 200 chars', () => {
  const r = orderAddressSnapshotSchema.safeParse({
    version: 1,
    firstName: 'Juan',
    lastName: 'Pérez',
    line1: 'x'.repeat(201),
    city: 'Madrid',
    province: 'Madrid',
    postalCode: '28001',
  })
  assert.equal(r.success, false)
})

test('orderAddressSnapshotSchema accepts a normal address', () => {
  const r = orderAddressSnapshotSchema.safeParse({
    version: 1,
    firstName: 'Juan',
    lastName: 'Pérez',
    line1: 'Calle Real 12, 3º A',
    line2: 'Escalera Izda',
    city: 'Madrid',
    province: 'Madrid',
    postalCode: '28001',
    phone: '+34 600123456',
  })
  assert.equal(r.success, true)
})

test('orderAddressSnapshotSchema rejects 10000-char phone payload (issue test plan)', () => {
  const r = orderAddressSnapshotSchema.safeParse({
    version: 1,
    firstName: 'Juan',
    lastName: 'Pérez',
    line1: 'Calle Real',
    city: 'Madrid',
    province: 'Madrid',
    postalCode: '28001',
    phone: 'x'.repeat(10_000),
  })
  assert.equal(r.success, false)
})

test('orderLineSnapshotSchema rejects 10000-char product name', () => {
  const r = orderLineSnapshotSchema.safeParse({
    version: 1,
    id: 'prod-1',
    name: 'x'.repeat(10_000),
    slug: 'p',
    images: [],
    unit: 'kg',
    vendorName: 'Vendor',
  })
  assert.equal(r.success, false)
})

test('orderLineSnapshotSchema rejects > 20 images per line', () => {
  const tooMany = Array.from({ length: 21 }, () => 'https://example.com/x.png')
  const r = orderLineSnapshotSchema.safeParse({
    version: 1,
    id: 'prod-1',
    name: 'Producto',
    slug: 'p',
    images: tooMany,
    unit: 'kg',
    vendorName: 'Vendor',
  })
  assert.equal(r.success, false)
})

test('orderLineSnapshotSchema accepts a normal line snapshot', () => {
  const r = orderLineSnapshotSchema.safeParse({
    version: 1,
    id: 'prod-1',
    name: 'Queso curado',
    slug: 'queso-curado',
    images: ['https://example.com/q.png'],
    unit: 'kg',
    vendorName: 'Quesería',
    variantName: '500g',
  })
  assert.equal(r.success, true)
})
