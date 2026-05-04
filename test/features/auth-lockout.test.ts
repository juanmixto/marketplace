/**
 * Per-account login lockout (#1276).
 *
 * Pure-function coverage of the back-off schedule. The DB-backed
 * `recordLoginFailure` / `clearLoginFailures` are exercised via the
 * integration suite where Postgres is available.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LOCKOUT_BASE_SECONDS,
  LOCKOUT_MAX_SECONDS,
  LOCKOUT_THRESHOLD,
  evaluateLockoutOnFailure,
  isLocked,
} from '@/domains/auth/lockout'

test('first 4 failures do NOT engage the lockout (typo-budget for honest users)', () => {
  for (let i = 0; i < LOCKOUT_THRESHOLD; i += 1) {
    assert.equal(evaluateLockoutOnFailure(i), null)
  }
})

test('5th consecutive failure engages a 30s lockout', () => {
  assert.equal(evaluateLockoutOnFailure(LOCKOUT_THRESHOLD), LOCKOUT_BASE_SECONDS)
  assert.equal(evaluateLockoutOnFailure(5), 30)
})

test('lockout doubles each subsequent failure (exponential back-off)', () => {
  assert.equal(evaluateLockoutOnFailure(6), 60)
  assert.equal(evaluateLockoutOnFailure(7), 120)
  assert.equal(evaluateLockoutOnFailure(8), 240)
})

test('lockout caps at LOCKOUT_MAX_SECONDS', () => {
  assert.equal(evaluateLockoutOnFailure(9), LOCKOUT_MAX_SECONDS)
  assert.equal(evaluateLockoutOnFailure(15), LOCKOUT_MAX_SECONDS)
  assert.equal(evaluateLockoutOnFailure(1000), LOCKOUT_MAX_SECONDS)
})

test('isLocked reports false when no window is set', () => {
  const result = isLocked({ lockoutUntil: null })
  assert.equal(result.locked, false)
})

test('isLocked reports true while the window is in the future', () => {
  const future = new Date(Date.now() + 60_000)
  const result = isLocked({ lockoutUntil: future })
  assert.equal(result.locked, true)
  assert.equal(result.unlockAt?.getTime(), future.getTime())
})

test('isLocked reports false once the window has elapsed', () => {
  const past = new Date(Date.now() - 60_000)
  const result = isLocked({ lockoutUntil: past })
  assert.equal(result.locked, false)
})
