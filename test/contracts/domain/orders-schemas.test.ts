import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addressSchema,
  checkoutSchema,
  checkoutWithSavedAddressSchema,
  checkoutFormSchema,
  orderItemSchema,
} from '@/domains/orders/checkout'

/**
 * Phase-12 schema-freeze test for the orders domain's public Zod
 * schemas. Companion to test/contracts/domain/snapshots.test.ts
 * (Phase 6 / PR #502) — same pattern, broader coverage.
 *
 * Why these matter:
 *
 *   - addressSchema       → server validates buyer-submitted address
 *                           on every checkout. A silent rename would
 *                           drop a field server-side that the client
 *                           still posts.
 *   - checkoutSchema /    → wrap addressSchema for the two checkout
 *     checkoutWith…         flavours (new address vs saved address);
 *                           server actions parse one or the other
 *                           depending on the buyer's choice.
 *   - checkoutFormSchema  → flat-shape variant the buyer client form
 *                           uses (RHF needs every field at the top
 *                           level + saveAddress / selectedAddressId).
 *                           Drift here breaks the form silently.
 *   - orderItemSchema     → cart line shape; consumed by every
 *                           checkout / subscription / promotion
 *                           evaluation that iterates lines.
 *
 * If you intentionally change one of these shapes, update the
 * matching `expected` block in the same PR. The failure message
 * tells the reviewer what drifted.
 */

type ExpectedShape = {
  required: readonly string[]
  optional: readonly string[]
}

function shapeOf(
  schema: { _zod: { def: { shape?: Record<string, { _zod: { optin?: string } }> } } },
) {
  return schema._zod.def.shape ?? {}
}

function assertShape(
  label: string,
  schema: { _zod: { def: { shape?: Record<string, { _zod: { optin?: string } }> } } },
  expected: ExpectedShape,
) {
  const shape = shapeOf(schema)
  const actualKeys = Object.keys(shape).sort()
  const expectedKeys = [...expected.required, ...expected.optional].sort()

  assert.deepEqual(
    actualKeys,
    expectedKeys,
    `${label}: schema key set drifted. If the change is intentional, update the expected key list in this test in the same PR.`,
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

// ─── addressSchema ────────────────────────────────────────────────────────────
// .superRefine layers a postal-code/province check on top of the object
// schema. Both the unrefined object's keys and the refinement contract are
// pinned: the cross-field check is what guarantees the snapshot is
// dispatchable.

test('addressSchema — frozen shape', () => {
  assertShape('addressSchema', addressSchema as never, {
    required: ['firstName', 'lastName', 'line1', 'city', 'province', 'postalCode'],
    optional: ['line2', 'phone'],
  })
})

test('addressSchema — postal/province cross-field check still active', () => {
  // 28xxx is Madrid. Pairing it with Barcelona must fail at the postalCode
  // path. If this stops failing, the superRefine got accidentally dropped.
  const result = addressSchema.safeParse({
    firstName: 'A',
    lastName: 'B',
    line1: 'Calle Real 1',
    city: 'Barcelona',
    province: 'Barcelona',
    postalCode: '28001',
  })
  assert.equal(result.success, false)
  if (!result.success) {
    const postalIssue = result.error.issues.find(i => i.path[0] === 'postalCode')
    assert.ok(postalIssue, 'expected an issue on the postalCode path')
  }
})

// ─── checkoutSchema (server, new-address path) ────────────────────────────────

test('checkoutSchema — frozen shape', () => {
  assertShape('checkoutSchema', checkoutSchema as never, {
    required: ['address'],
    optional: ['saveAddress', 'selectedAddressId'],
  })
})

// ─── checkoutWithSavedAddressSchema (server, saved-address path) ──────────────

test('checkoutWithSavedAddressSchema — frozen shape', () => {
  assertShape('checkoutWithSavedAddressSchema', checkoutWithSavedAddressSchema as never, {
    required: ['selectedAddressId'],
    optional: ['address', 'saveAddress'],
  })
})

// ─── checkoutFormSchema (client, RHF-flat shape) ──────────────────────────────
// This one duplicated the address fields inline before Phase 9 (PR #489)
// consolidated it. The freeze keeps the duplication-prevention honest.

test('checkoutFormSchema — frozen shape', () => {
  assertShape('checkoutFormSchema', checkoutFormSchema as never, {
    required: ['firstName', 'lastName', 'line1', 'city', 'province', 'postalCode'],
    optional: ['line2', 'phone', 'saveAddress', 'selectedAddressId'],
  })
})

test('checkoutFormSchema — postal/province cross-field check still active', () => {
  // Same probe as addressSchema — the form schema shares the refinement.
  const result = checkoutFormSchema.safeParse({
    firstName: 'A',
    lastName: 'B',
    line1: 'Calle Real 1',
    city: 'Barcelona',
    province: 'Barcelona',
    postalCode: '28001',
  })
  assert.equal(result.success, false)
})

// ─── orderItemSchema (cart-line shape) ────────────────────────────────────────

test('orderItemSchema — frozen shape', () => {
  assertShape('orderItemSchema', orderItemSchema as never, {
    required: ['productId', 'quantity'],
    optional: ['variantId'],
  })
})

test('orderItemSchema — rejects negative quantity', () => {
  const result = orderItemSchema.safeParse({
    productId: 'p_1',
    quantity: -1,
  })
  assert.equal(result.success, false)
})
