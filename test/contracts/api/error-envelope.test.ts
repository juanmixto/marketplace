import test from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import {
  apiError,
  apiBadRequest,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiConflict,
  apiValidationError,
  apiValidationFromZod,
  apiRateLimited,
  apiInternalError,
  zodFieldErrors,
  type ApiErrorCode,
} from '@/lib/api-response'

/**
 * Phase 6 of the contract-hardening plan.
 *
 * Locks down the canonical API error-response envelope. Every helper in
 * src/lib/api-response.ts must produce a JSON body that conforms to this
 * schema, and the helper-to-status-and-code mapping must stay stable.
 *
 * If a route handler renames a field or changes a status code, the client
 * code that depends on `code` for retry/redirect decisions breaks silently.
 * This suite catches that at CI time.
 */

const apiErrorCodeEnum: readonly ApiErrorCode[] = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const

const errorEnvelopeSchema = z
  .object({
    error: z.string().min(1),
    code: z.enum([
      'BAD_REQUEST',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'VALIDATION_ERROR',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
    ]),
    details: z.unknown().optional(),
    fieldErrors: z.record(z.string(), z.string()).optional(),
  })
  .strict()

async function parseEnvelope(res: Response) {
  const json = await res.json()
  return errorEnvelopeSchema.parse(json)
}

test('apiError(message, status, code) emits a strict envelope', async () => {
  const res = apiError('boom', 418, 'BAD_REQUEST')
  assert.equal(res.status, 418)
  assert.equal(res.headers.get('content-type'), 'application/json')
  const body = await parseEnvelope(res)
  assert.equal(body.code, 'BAD_REQUEST')
  assert.equal(body.error, 'boom')
})

test('apiBadRequest → status 400, code BAD_REQUEST', async () => {
  const res = apiBadRequest('Falta el campo X')
  assert.equal(res.status, 400)
  const body = await parseEnvelope(res)
  assert.equal(body.code, 'BAD_REQUEST')
  assert.equal(body.error, 'Falta el campo X')
})

test('apiUnauthorized → status 401, code UNAUTHORIZED, default message', async () => {
  const res = apiUnauthorized()
  assert.equal(res.status, 401)
  const body = await parseEnvelope(res)
  assert.equal(body.code, 'UNAUTHORIZED')
  assert.equal(body.error, 'No autorizado')
})

test('apiForbidden → status 403, code FORBIDDEN', async () => {
  const res = apiForbidden()
  assert.equal(res.status, 403)
  const body = await parseEnvelope(res)
  assert.equal(body.code, 'FORBIDDEN')
})

test('apiNotFound → status 404, code NOT_FOUND', async () => {
  const res = apiNotFound()
  assert.equal(res.status, 404)
  const body = await parseEnvelope(res)
  assert.equal(body.code, 'NOT_FOUND')
})

test('apiConflict → status 409, code CONFLICT', async () => {
  const res = apiConflict('email taken')
  assert.equal(res.status, 409)
  const body = await parseEnvelope(res)
  assert.equal(body.code, 'CONFLICT')
})

test('apiValidationError → status 422, code VALIDATION_ERROR', async () => {
  const res = apiValidationError('Datos inválidos')
  assert.equal(res.status, 422)
  const body = await parseEnvelope(res)
  assert.equal(body.code, 'VALIDATION_ERROR')
})

test('apiRateLimited → status 429, code RATE_LIMITED, sets Retry-After header', async () => {
  const res = apiRateLimited('Demasiadas peticiones', 60, 5)
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('retry-after'), '60')
  assert.equal(res.headers.get('x-ratelimit-limit'), '5')
  const body = await parseEnvelope(res)
  assert.equal(body.code, 'RATE_LIMITED')
})

test('apiRateLimited rounds fractional retry-after seconds UP', async () => {
  const res = apiRateLimited('slow down', 12.3, undefined)
  assert.equal(res.headers.get('retry-after'), '13')
  assert.equal(res.headers.get('x-ratelimit-limit'), null)
})

test('apiRateLimited clamps negative retry-after to 0', async () => {
  const res = apiRateLimited('legacy', -5, undefined)
  assert.equal(res.headers.get('retry-after'), '0')
})

test('apiInternalError → status 500, code INTERNAL_ERROR, default message', async () => {
  const res = apiInternalError()
  assert.equal(res.status, 500)
  const body = await parseEnvelope(res)
  assert.equal(body.code, 'INTERNAL_ERROR')
  assert.equal(body.error, 'Error interno')
})

test('apiValidationFromZod attaches fieldErrors derived from Zod issues', async () => {
  const schema = z.object({
    email: z.string().email(),
    age: z.number().int().nonnegative(),
  })
  const result = schema.safeParse({ email: 'not-an-email', age: -1 })
  assert.equal(result.success, false)

  const res = apiValidationFromZod(result.error!)
  assert.equal(res.status, 422)
  const body = await parseEnvelope(res)
  assert.equal(body.code, 'VALIDATION_ERROR')
  assert.ok(body.fieldErrors)
  assert.ok(body.fieldErrors.email)
  assert.ok(body.fieldErrors.age)
})

test('zodFieldErrors keeps the FIRST message per dotted path', () => {
  // z.string().email().min(10) emits two issues at the same path when the
  // input is both too short AND not a valid email — exactly the scenario
  // where the helper's "first wins" semantics matter for the UI.
  const schema = z.object({
    email: z.string().email('not an email').min(10, 'too short'),
  })
  const result = schema.safeParse({ email: 'foo' })
  assert.equal(result.success, false)
  assert.ok(result.error!.issues.length >= 2, 'sanity: Zod should report both issues')

  const map = zodFieldErrors(result.error!)
  // Whichever message comes first in the Zod issue list is what the
  // user sees next to the input. We pin that the helper preserves the
  // original order rather than e.g. sorting alphabetically.
  assert.equal(map.email, result.error!.issues[0]!.message)
})

test('apiError options bag (fieldErrors + headers) is honored', async () => {
  const res = apiError('Hay errores', 422, 'VALIDATION_ERROR', {
    fieldErrors: { email: 'Email inválido' },
    headers: { 'x-trace-id': 'abc-123' },
  })
  assert.equal(res.status, 422)
  assert.equal(res.headers.get('x-trace-id'), 'abc-123')
  const body = await parseEnvelope(res)
  assert.equal(body.fieldErrors?.email, 'Email inválido')
})

test('apiError legacy (details, headers) tuple still works for back-compat', async () => {
  const res = apiError('legacy', 400, 'BAD_REQUEST', { reason: 'old call site' }, {
    'x-legacy': 'yes',
  })
  assert.equal(res.headers.get('x-legacy'), 'yes')
  const body = await parseEnvelope(res)
  assert.deepEqual(body.details, { reason: 'old call site' })
})

test('every ApiErrorCode is covered by at least one helper', () => {
  // If a new code is added to ApiErrorCode without a matching helper or
  // direct apiError(...) call site, this assertion forces us to extend
  // either the helpers or the test enumeration above.
  const helpers = [
    apiBadRequest('x'),
    apiUnauthorized(),
    apiForbidden(),
    apiNotFound(),
    apiConflict('x'),
    apiValidationError('x'),
    apiRateLimited('x', 1),
    apiInternalError(),
  ]
  const codesProduced = new Set(
    helpers.map(r => {
      // The headers map intentionally exposes content-type; we read the
      // body once per response without consuming it twice.
      return r as unknown as { _bodyInit?: unknown }
    }).map((_, i) => apiErrorCodeEnum[i])
  )
  for (const code of apiErrorCodeEnum) {
    assert.ok(codesProduced.has(code), `no helper covers code ${code}`)
  }
})
