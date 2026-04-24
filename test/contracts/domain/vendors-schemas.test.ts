import test from 'node:test'
import assert from 'node:assert/strict'
import { vendorApplicationSchema } from '@/domains/vendors/apply-schema'

/**
 * Schema-freeze for the self-service vendor application write surface.
 * A buyer fills this to apply as a producer (see applyAsVendor in
 * src/domains/vendors/apply.ts). Drifting the shape would 422 a
 * previously valid submission or quietly accept fields the server
 * does not persist.
 */

type ExpectedShape = {
  required: readonly string[]
  optional: readonly string[]
}

function assertObjectShape(
  label: string,
  schema: { _zod: { def: { shape: Record<string, { _zod: { optin?: string } }> } } },
  expected: ExpectedShape,
) {
  const shape = schema._zod.def.shape
  const actualKeys = Object.keys(shape).sort()
  const expectedKeys = [...expected.required, ...expected.optional].sort()
  assert.deepEqual(actualKeys, expectedKeys, `${label}: schema key set drifted.`)

  const required: string[] = []
  const optional: string[] = []
  for (const [key, field] of Object.entries(shape)) {
    const isOptional = field._zod.optin === 'optional'
    if (isOptional) optional.push(key)
    else required.push(key)
  }
  required.sort()
  optional.sort()
  assert.deepEqual(required, [...expected.required].sort(), `${label}: required drifted.`)
  assert.deepEqual(optional, [...expected.optional].sort(), `${label}: optional drifted.`)
}

test('vendorApplicationSchema — frozen shape', () => {
  assertObjectShape('vendorApplicationSchema', vendorApplicationSchema as never, {
    required: ['displayName'],
    optional: ['description', 'location', 'category'],
  })
})

test('vendorApplicationSchema — displayName length bounds', () => {
  assert.equal(
    vendorApplicationSchema.safeParse({ displayName: 'a' }).success,
    false,
    'displayName below minimum (2) must be rejected',
  )
  assert.equal(
    vendorApplicationSchema.safeParse({ displayName: 'x'.repeat(81) }).success,
    false,
    'displayName above maximum (80) must be rejected',
  )
  assert.equal(
    vendorApplicationSchema.safeParse({ displayName: 'Ab' }).success,
    true,
  )
})

test('vendorApplicationSchema — category is a closed VendorCategory enum', () => {
  for (const category of [
    'BAKERY',
    'CHEESE',
    'WINERY',
    'ORCHARD',
    'OLIVE_OIL',
    'FARM',
    'DRYLAND',
    'LOCAL_PRODUCER',
  ]) {
    const parsed = vendorApplicationSchema.safeParse({
      displayName: 'Business',
      category,
    })
    assert.equal(parsed.success, true, `category ${category} must parse`)
  }
  const bad = vendorApplicationSchema.safeParse({
    displayName: 'Business',
    category: 'CHARCUTERIE',
  })
  assert.equal(bad.success, false)
})
