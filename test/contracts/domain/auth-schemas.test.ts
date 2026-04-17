import test from 'node:test'
import assert from 'node:assert/strict'
import { registerSchema, REGISTER_PASSWORD_LIMITS } from '@/shared/types/auth'
import { PROFILE_FIELD_LIMITS } from '@/shared/types/profile'

/**
 * Schema-freeze for the registration endpoint contract. The route at
 * `src/app/api/auth/register/route.ts` consumes registerSchema directly,
 * so any drift here surfaces both server-side validation regressions
 * and the future client signup-form constraints derived from these
 * limits.
 *
 * Companion to:
 *   - test/contracts/domain/profile-schema.test.ts (the profile shape
 *     this schema mirrors for firstName/lastName)
 *   - test/contracts/domain/orders-schemas.test.ts
 *   - test/contracts/domain/snapshots.test.ts
 */

function assertShape(
  label: string,
  schema: { _zod: { def: { shape: Record<string, { _zod: { optin?: string } }> } } },
  expected: { required: readonly string[]; optional: readonly string[] },
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

test('registerSchema — frozen shape', () => {
  assertShape('registerSchema', registerSchema as never, {
    required: ['firstName', 'lastName', 'email', 'password'],
    optional: [],
  })
})

test('REGISTER_PASSWORD_LIMITS — frozen numeric bounds', () => {
  // Critical security contract — relaxing min would weaken signup
  // password strength; tightening it would break existing passwords on
  // the next change-password flow if not coordinated. Either way,
  // touching these without intent should fail review.
  assert.equal(REGISTER_PASSWORD_LIMITS.min, 8)
  assert.equal(REGISTER_PASSWORD_LIMITS.max, 100)
})

test('registerSchema — firstName/lastName limits derive from PROFILE_FIELD_LIMITS', () => {
  // Sanity check that signup and profile-edit use the same width;
  // a mismatch would let users register with names the profile
  // form would later reject as too long.
  const tooLongFirst = 'x'.repeat(PROFILE_FIELD_LIMITS.firstName.max + 1)
  const result = registerSchema.safeParse({
    firstName: tooLongFirst,
    lastName: 'OK',
    email: 'a@b.co',
    password: 'longenough',
  })
  assert.equal(result.success, false)
})

test('registerSchema — rejects short password', () => {
  const result = registerSchema.safeParse({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: 'x'.repeat(REGISTER_PASSWORD_LIMITS.min - 1),
  })
  assert.equal(result.success, false)
})

test('registerSchema — rejects invalid email', () => {
  const result = registerSchema.safeParse({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'not-an-email',
    password: 'longenough',
  })
  assert.equal(result.success, false)
})
