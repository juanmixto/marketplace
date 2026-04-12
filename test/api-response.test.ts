import test from 'node:test'
import assert from 'node:assert/strict'
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
