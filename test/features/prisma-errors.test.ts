import test from 'node:test'
import assert from 'node:assert/strict'
import { isUniqueConstraintViolation, isRecordNotFoundError } from '@/lib/prisma-errors'

test('isUniqueConstraintViolation matches Prisma P2002 errors', () => {
  assert.equal(isUniqueConstraintViolation({ code: 'P2002' }), true)
  assert.equal(
    isUniqueConstraintViolation({ code: 'P2002', meta: { target: ['email'] } }),
    true
  )
})

test('isUniqueConstraintViolation rejects unrelated errors', () => {
  assert.equal(isUniqueConstraintViolation({ code: 'P2025' }), false)
  assert.equal(isUniqueConstraintViolation(new Error('boom')), false)
  assert.equal(isUniqueConstraintViolation({ code: 1234 }), false)
  assert.equal(isUniqueConstraintViolation(null), false)
  assert.equal(isUniqueConstraintViolation(undefined), false)
  assert.equal(isUniqueConstraintViolation('P2002'), false)
})

test('isRecordNotFoundError matches Prisma P2025 errors only', () => {
  assert.equal(isRecordNotFoundError({ code: 'P2025' }), true)
  assert.equal(isRecordNotFoundError({ code: 'P2002' }), false)
  assert.equal(isRecordNotFoundError(null), false)
})
