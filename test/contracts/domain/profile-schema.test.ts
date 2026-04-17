import test from 'node:test'
import assert from 'node:assert/strict'
import { profileBaseSchema, PROFILE_FIELD_LIMITS } from '@/shared/types/profile'

/**
 * Schema-freeze test for the shared profile contract. Phase-12 companion
 * to test/contracts/domain/orders-schemas.test.ts.
 *
 * The shape and the numeric limits are both pinned because two surfaces
 * (the API route + the buyer form) consume them and the limits drive
 * both server-side validation and client-side error copy.
 */

function assertShape(
  label: string,
  schema: { _zod: { def: { shape: Record<string, { _zod: { optin?: string } }> } } },
  expected: { required: readonly string[]; optional: readonly string[] },
) {
  const shape = schema._zod.def.shape
  const actualKeys = Object.keys(shape).sort()
  const expectedKeys = [...expected.required, ...expected.optional].sort()

  assert.deepEqual(
    actualKeys,
    expectedKeys,
    `${label}: schema key set drifted.`,
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

  assert.deepEqual(required, [...expected.required].sort(), `${label}: required drifted.`)
  assert.deepEqual(optional, [...expected.optional].sort(), `${label}: optional drifted.`)
}

test('profileBaseSchema — frozen shape', () => {
  assertShape('profileBaseSchema', profileBaseSchema as never, {
    required: ['firstName', 'lastName', 'email'],
    optional: [],
  })
})

test('PROFILE_FIELD_LIMITS — frozen numeric bounds', () => {
  // The API route's "Máximo N caracteres" error string and the buyer
  // form's max-length attribute both derive from these. A silent change
  // would un-sync server validation from client UX.
  assert.equal(PROFILE_FIELD_LIMITS.firstName.min, 1)
  assert.equal(PROFILE_FIELD_LIMITS.firstName.max, 50)
  assert.equal(PROFILE_FIELD_LIMITS.lastName.min, 1)
  assert.equal(PROFILE_FIELD_LIMITS.lastName.max, 50)
})

test('profileBaseSchema — rejects oversized firstName', () => {
  const tooLong = 'x'.repeat(PROFILE_FIELD_LIMITS.firstName.max + 1)
  const result = profileBaseSchema.safeParse({
    firstName: tooLong,
    lastName: 'OK',
    email: 'a@b.co',
  })
  assert.equal(result.success, false)
})

test('profileBaseSchema — rejects malformed email', () => {
  const result = profileBaseSchema.safeParse({
    firstName: 'A',
    lastName: 'B',
    email: 'not-an-email',
  })
  assert.equal(result.success, false)
})
