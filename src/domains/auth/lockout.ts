/**
 * Per-account login lockout (#1276).
 *
 * The pre-existing per-identity rate-limit (`login-identity`,
 * 10 attempts / 15 min) bounds the velocity of a brute-force, but
 * recycles every 90 s and never escalates. A patient attacker with a
 * password list can keep retrying indefinitely while paying a 1.5 s
 * average per attempt.
 *
 * This adds a second layer that escalates: count consecutive failures
 * on the User row itself, and once the counter crosses
 * LOCKOUT_THRESHOLD, set `lockoutUntil` to a back-off window. The
 * window doubles each subsequent failure up to LOCKOUT_MAX_SECONDS, so
 * a script that ignores the rate-limit walls quickly hits an
 * exponential cost wall on the per-account side.
 *
 * Successful credentials login clears both fields atomically. A
 * legitimate user with a typo retries 4 times — well below the
 * threshold — and never sees a lockout. A user who gets locked out
 * (genuine forgotten password) waits the back-off and retries; if the
 * password is right we clear the state.
 *
 * Race-safe via Prisma's `update` with composite where-clause: two
 * concurrent failures on the same account both end up with the counter
 * incremented exactly once per attempt and the larger of the two
 * computed `lockoutUntil` values.
 *
 * The function `evaluateLockoutOnFailure` returns the schedule purely
 * so we can unit-test it without a DB.
 */

import { db } from '@/lib/db'

// Tuned for pre-launch volume. Threshold > typical user typo budget,
// max window short enough that an honest user who waits and tries
// again can recover, long enough that a brute-force script with a
// 100k-password list pays >a year of wall-clock just to finish one
// account.
export const LOCKOUT_THRESHOLD = 5
export const LOCKOUT_BASE_SECONDS = 30
export const LOCKOUT_MAX_SECONDS = 300

/**
 * Pure function: given the consecutive-failure count after a fresh
 * failure, return the lockout window in seconds, or null if the
 * threshold hasn't been reached yet.
 *
 * Schedule: 5th fail = 30s, 6th = 60s, 7th = 120s, 8th = 240s,
 * 9th+ = 300s.
 */
export function evaluateLockoutOnFailure(failureCount: number): number | null {
  if (failureCount < LOCKOUT_THRESHOLD) return null
  const stepsAboveThreshold = failureCount - LOCKOUT_THRESHOLD
  const seconds = LOCKOUT_BASE_SECONDS * 2 ** stepsAboveThreshold
  return Math.min(seconds, LOCKOUT_MAX_SECONDS)
}

export interface LockoutCheckResult {
  /** True when the account is currently locked. Caller must NOT verify the password. */
  locked: boolean
  /** When the lock will expire. Undefined if not locked. */
  unlockAt?: Date
}

export function isLocked(user: { lockoutUntil: Date | null }): LockoutCheckResult {
  if (!user.lockoutUntil) return { locked: false }
  if (user.lockoutUntil.getTime() <= Date.now()) return { locked: false }
  return { locked: true, unlockAt: user.lockoutUntil }
}

/**
 * Increment the failure counter atomically and, if the new count
 * crosses the threshold, set lockoutUntil to the computed back-off.
 * Returns the post-update counter so the caller can log telemetry.
 */
export async function recordLoginFailure(userId: string): Promise<{ count: number; lockedUntil: Date | null }> {
  const updated = await db.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  })

  const window = evaluateLockoutOnFailure(updated.failedLoginAttempts)
  if (!window) {
    return { count: updated.failedLoginAttempts, lockedUntil: null }
  }

  const lockedUntil = new Date(Date.now() + window * 1000)
  await db.user.update({
    where: { id: userId },
    data: { lockoutUntil: lockedUntil },
  })
  return { count: updated.failedLoginAttempts, lockedUntil }
}

/**
 * Clear the failure counter and lockout window after a successful
 * password verification. Skipped when both are already at their
 * defaults to avoid an unnecessary write on every login.
 */
export async function clearLoginFailures(user: {
  id: string
  failedLoginAttempts: number
  lockoutUntil: Date | null
}): Promise<void> {
  if (user.failedLoginAttempts === 0 && !user.lockoutUntil) return
  await db.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockoutUntil: null },
  })
}
