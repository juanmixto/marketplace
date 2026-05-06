/**
 * Nightly cleanup-abandoned job (#1285, epic #1268 Bloque 2).
 *
 * Single recurring tick that purges ephemeral state nobody owns
 * anymore. Each step is independent and short — running them in one
 * job (vs four) keeps observability simple: one schedule, one log
 * line per run with all the counters.
 *
 * Steps (all DELETE-only, no state-machine transitions):
 *   1. `VerificationToken`        rows past `expires`        — NextAuth's email-magic-link table.
 *   2. `EmailVerificationToken`   rows past `expiresAt`      — first-time email verification.
 *   3. `PasswordResetToken`       rows past `expiresAt`      — password reset flow.
 *   4. `TelegramLinkToken`        rows past `expiresAt`      — Telegram chat-link onboarding.
 *
 * Out of scope intentionally:
 *   - `Order.paymentStatus='PENDING'` past 24h — that's a state-
 *     machine transition (PLACED → CANCELLED), and FSM ownership
 *     lives in the orders epic (#1330). Attempting it here would
 *     bypass `assertOrderTransition` and the audit trail.
 *   - `Vendor.status='APPLYING'` past N days — there's no concept of
 *     "vendor lead" separate from a regular Vendor row, and admins
 *     legitimately let onboarding sit while they vet documents.
 *   - `IdempotencyKey` expired — already covered by the existing
 *     `cleanup-idempotency` host cron (#1307).
 *
 * Idempotent: re-running yields zero deletes (everything past
 * `expiresAt` was already gone). Safe to fire any number of times.
 *
 * Dependencies are injectable so the test suite can pass a stub
 * client and an in-memory logger.
 */

import { db } from '@/lib/db'
import { logger as defaultLogger, type Logger } from '@/lib/logger'

export const CLEANUP_ABANDONED_JOB = 'cleanup.abandoned'
// 04:30 UTC every night — staggered 90 minutes after the rawjson
// sweep (03:00) so a slow night doesn't queue them on top of each
// other.
export const CLEANUP_ABANDONED_CRON = '30 4 * * *'

interface CleanupAbandonedDeps {
  /** Optional Prisma-shaped client for testing. Defaults to `db`. */
  client?: typeof db
  logger?: Logger
  /** Defaults to `new Date()`. Tests pass a fixed clock. */
  now?: () => Date
}

export interface CleanupAbandonedResult {
  verificationTokens: number
  emailVerificationTokens: number
  passwordResetTokens: number
  telegramLinkTokens: number
}

export async function runCleanupAbandonedJob(
  deps: CleanupAbandonedDeps = {},
): Promise<CleanupAbandonedResult> {
  const client = deps.client ?? db
  const log = deps.logger ?? defaultLogger
  const now = (deps.now ?? (() => new Date()))()

  const [
    verificationTokens,
    emailVerificationTokens,
    passwordResetTokens,
    telegramLinkTokens,
  ] = await Promise.all([
    client.verificationToken.deleteMany({ where: { expires: { lt: now } } }),
    client.emailVerificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    client.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    client.telegramLinkToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ])

  const result: CleanupAbandonedResult = {
    verificationTokens: verificationTokens.count,
    emailVerificationTokens: emailVerificationTokens.count,
    passwordResetTokens: passwordResetTokens.count,
    telegramLinkTokens: telegramLinkTokens.count,
  }

  // Single structured log line. Counters are operational signal — a
  // sudden spike in `passwordResetTokens` deletions on a quiet day
  // means somebody triggered a lot of resets that nobody completed,
  // which is a noisy-neighbour or enumeration probe smell.
  log.info('cleanup.abandoned.completed', { ...result })

  return result
}
