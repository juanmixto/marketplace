import test from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import {
  apiBadRequest,
  apiConflict,
  apiError,
  apiForbidden,
  apiInternalError,
  apiNotFound,
  apiRateLimited,
  apiUnauthorized,
  apiValidationError,
  apiValidationFromZod,
  zodFieldErrors,
} from '@/lib/api-response'

async function readBody(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

test('apiError returns the canonical shape and status', async () => {
  const res = apiError('boom', 500, 'INTERNAL_ERROR', { trace: 'abc' })
  assert.equal(res.status, 500)
  const body = await readBody(res)
  assert.equal(body.error, 'boom')
  assert.equal(body.code, 'INTERNAL_ERROR')
  assert.deepEqual(body.details, { trace: 'abc' })
})

test('apiError omits details when not provided', async () => {
  const res = apiError('nope', 400, 'BAD_REQUEST')
  const body = await readBody(res)
  assert.equal('details' in body, false)
})

test('shorthands map to the expected status and code', async () => {
  const cases: Array<[Response, number, string]> = [
    [apiBadRequest('x'), 400, 'BAD_REQUEST'],
    [apiUnauthorized(), 401, 'UNAUTHORIZED'],
    [apiForbidden(), 403, 'FORBIDDEN'],
    [apiNotFound(), 404, 'NOT_FOUND'],
    [apiConflict('dup'), 409, 'CONFLICT'],
    [apiValidationError('bad'), 422, 'VALIDATION_ERROR'],
    [apiInternalError(), 500, 'INTERNAL_ERROR'],
  ]
  for (const [res, status, code] of cases) {
    assert.equal(res.status, status)
    const body = await readBody(res)
    assert.equal(body.code, code)
    assert.equal(typeof body.error, 'string')
  }
})

test('apiRateLimited sets Retry-After header and optional limit', async () => {
  const res = apiRateLimited('slow down', 120, 5)
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('Retry-After'), '120')
  assert.equal(res.headers.get('X-RateLimit-Limit'), '5')
  const body = await readBody(res)
  assert.equal(body.code, 'RATE_LIMITED')
})

test('apiRateLimited floors negative retry-after to zero', () => {
  const res = apiRateLimited('slow down', -4)
  assert.equal(res.headers.get('Retry-After'), '0')
})

// ─── #131: per-field validation error surfacing ──────────────────────────────

test('zodFieldErrors flattens issues into a path → message map (#131)', () => {
  const schema = z.object({
    firstName: z.string().min(1, 'El nombre es obligatorio'),
    email: z.string().email('Email inválido'),
    nested: z.object({ age: z.number().min(18, 'Tienes que ser mayor de edad') }),
  })

  const result = schema.safeParse({ firstName: '', email: 'no-arroba', nested: { age: 12 } })
  assert.equal(result.success, false)

  const fieldErrors = zodFieldErrors(result.error!)
  assert.equal(fieldErrors.firstName, 'El nombre es obligatorio')
  assert.equal(fieldErrors.email, 'Email inválido')
  assert.equal(fieldErrors['nested.age'], 'Tienes que ser mayor de edad')
})

test('zodFieldErrors keeps the first message per path (#131)', () => {
  const schema = z.object({
    password: z.string().min(8, 'Mínimo 8 caracteres').max(20, 'Máximo 20 caracteres'),
  })
  const result = schema.safeParse({ password: 'a'.repeat(50) })
  assert.equal(result.success, false)
  const fieldErrors = zodFieldErrors(result.error!)
  // Only the first issue (max in this case) is recorded — never two messages
  // for the same field, otherwise the form UI would show both at once.
  assert.equal(Object.keys(fieldErrors).length, 1)
  assert.equal(fieldErrors.password, 'Máximo 20 caracteres')
})

test('apiValidationFromZod returns 422 with fieldErrors and a human top-level message (#131)', async () => {
  const schema = z.object({
    firstName: z.string().min(1, 'Nombre obligatorio'),
    email: z.string().email('Email inválido'),
  })
  const result = schema.safeParse({ firstName: '', email: 'meh' })
  assert.equal(result.success, false)

  const res = apiValidationFromZod(result.error!)
  assert.equal(res.status, 422)
  const body = await readBody(res)
  assert.equal(body.code, 'VALIDATION_ERROR')
  assert.deepEqual(body.fieldErrors, {
    firstName: 'Nombre obligatorio',
    email: 'Email inválido',
  })
  // The top-level error mirrors the first field message so a basic client
  // that doesn't know about fieldErrors still shows something useful.
  assert.equal(body.error, 'Nombre obligatorio')
})

test('apiError accepts an options bag with fieldErrors for non-Zod conflicts (#131)', async () => {
  const res = apiError('Email ya en uso', 409, 'CONFLICT', {
    fieldErrors: { email: 'Email ya en uso' },
  })
  assert.equal(res.status, 409)
  const body = await readBody(res)
  assert.deepEqual(body.fieldErrors, { email: 'Email ya en uso' })
  assert.equal(body.code, 'CONFLICT')
})

test('apiError keeps legacy (details, headers) signature intact', async () => {
  const res = apiError('boom', 500, 'INTERNAL_ERROR', { trace: 'abc' })
  const body = await readBody(res)
  assert.deepEqual(body.details, { trace: 'abc' })
  assert.equal('fieldErrors' in body, false)
})

test('BuyerProfileForm forwards server fieldErrors into RHF setError (#131)', () => {
  // Source-level guard: the form must read `fieldErrors` from the response
  // body and call setError per known field instead of dumping a generic
  // banner. This keeps the contract honest if someone later refactors the
  // submit handler.
  const form = require('node:fs').readFileSync(
    new URL('../src/components/buyer/BuyerProfileForm.tsx', import.meta.url),
    'utf8'
  ) as string

  assert.match(form, /fieldErrors/, 'must read fieldErrors from the API response')
  assert.match(form, /profileForm\.setError/, 'must call setError on the profile form')
  assert.match(form, /passwordForm\.setError/, 'must call setError on the password form')
})
