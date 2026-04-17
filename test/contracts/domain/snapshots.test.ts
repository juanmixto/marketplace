import test from 'node:test'
import assert from 'node:assert/strict'
import {
  orderLineSnapshotSchema,
  orderAddressSnapshotSchema,
  paymentConfirmedEventPayloadSchema,
  paymentFailedEventPayloadSchema,
  paymentMismatchEventPayloadSchema,
} from '@/shared/types/snapshots'

/**
 * Phase 6 (contract-hardening) schema-freeze test for the JSON shapes
 * that get persisted into Prisma `Json` columns:
 *
 *   - OrderLine.productSnapshot          → orderLineSnapshotSchema
 *   - Order.shippingAddressSnapshot      → orderAddressSnapshotSchema
 *   - OrderEvent.payload (payment.*)     → payment{Confirmed,Failed,Mismatch}EventPayloadSchema
 *
 * Silently renaming or removing a field here would make historical rows
 * unparseable (or worse: parse as a partially-populated object and ship
 * incomplete data downstream). This suite locks the exact key set of each
 * schema and the required/optional split. A rename/removal/addition that
 * wasn't consciously versioned will fail CI.
 *
 * How to update intentionally:
 *   1. Bump the schema's `version` discriminant (see snapshots.ts header).
 *   2. Add a v2 schema + discriminated union.
 *   3. Update the expected key sets below in the same PR.
 */

type ExpectedShape = {
  required: readonly string[]
  optional: readonly string[]
}

function assertShape(
  label: string,
  schema: { _zod: { def: { shape: Record<string, { _zod: { optin?: string } }> } } },
  expected: ExpectedShape,
) {
  const shape = schema._zod.def.shape
  const actualKeys = Object.keys(shape).sort()
  const expectedKeys = [...expected.required, ...expected.optional].sort()

  assert.deepEqual(
    actualKeys,
    expectedKeys,
    `${label}: schema key set drifted. If this is intentional, bump the schema's version discriminant and update the expected key sets in this test in the same PR.`,
  )

  const required: string[] = []
  const optional: string[] = []
  for (const [key, field] of Object.entries(shape)) {
    const isOptional = field._zod.optin === 'optional'
    if (isOptional) optional.push(key)
    else required.push(key)
  }
  required.sort()
  optional.sort()

  assert.deepEqual(
    required,
    [...expected.required].sort(),
    `${label}: required field set drifted.`,
  )
  assert.deepEqual(
    optional,
    [...expected.optional].sort(),
    `${label}: optional field set drifted.`,
  )
}

test('orderLineSnapshotSchema — frozen shape', () => {
  assertShape('orderLineSnapshotSchema', orderLineSnapshotSchema as never, {
    required: ['id', 'name', 'slug', 'images', 'unit', 'vendorName'],
    optional: ['version', 'variantName'],
  })
})

test('orderLineSnapshotSchema — rejects object missing a required field', () => {
  const res = orderLineSnapshotSchema.safeParse({
    id: 'prod_1',
    name: 'Tomate',
    slug: 'tomate',
    images: [],
    vendorName: 'Huerta',
  })
  assert.equal(res.success, false)
})

test('orderLineSnapshotSchema — parses a legacy (version-less) row as v1', () => {
  const legacy = {
    id: 'prod_1',
    name: 'Tomate',
    slug: 'tomate',
    images: ['a.jpg'],
    unit: 'kg',
    vendorName: 'Huerta',
  }
  const parsed = orderLineSnapshotSchema.parse(legacy)
  assert.equal(parsed.version, 1)
})

test('orderAddressSnapshotSchema — frozen shape', () => {
  assertShape('orderAddressSnapshotSchema', orderAddressSnapshotSchema as never, {
    required: ['firstName', 'lastName', 'line1', 'city', 'province', 'postalCode'],
    optional: ['version', 'line2', 'phone'],
  })
})

test('orderAddressSnapshotSchema — parses a legacy (version-less) row as v1', () => {
  const legacy = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    line1: 'C/ Mayor 1',
    city: 'Madrid',
    province: 'Madrid',
    postalCode: '28001',
  }
  const parsed = orderAddressSnapshotSchema.parse(legacy)
  assert.equal(parsed.version, 1)
})

test('paymentConfirmedEventPayloadSchema — frozen shape', () => {
  assertShape('paymentConfirmedEventPayloadSchema', paymentConfirmedEventPayloadSchema as never, {
    required: ['providerRef'],
    optional: ['amount', 'eventId', 'source'],
  })
})

test('paymentFailedEventPayloadSchema — frozen shape', () => {
  assertShape('paymentFailedEventPayloadSchema', paymentFailedEventPayloadSchema as never, {
    required: ['providerRef'],
    optional: ['eventId'],
  })
})

test('paymentMismatchEventPayloadSchema — frozen shape', () => {
  assertShape('paymentMismatchEventPayloadSchema', paymentMismatchEventPayloadSchema as never, {
    required: ['providerRef', 'expectedAmount', 'expectedCurrency'],
    optional: ['amount', 'currency', 'eventId'],
  })
})
