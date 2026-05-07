/**
 * Nightly cleanup-abandoned job (#1285, extended for #1223).
 *
 * Single recurring tick that purges ephemeral state nobody owns
 * anymore. Each step is independent and short — running them in one
 * job (vs five) keeps observability simple: one schedule, one log
 * line per run with all the counters.
 *
 * Steps (all DELETE-only, no state-machine transitions):
 *   1. `VerificationToken`        rows past `expires`        — NextAuth's email-magic-link table.
 *   2. `EmailVerificationToken`   rows past `expiresAt`      — first-time email verification.
 *   3. `PasswordResetToken`       rows past `expiresAt`      — password reset flow.
 *   4. `TelegramLinkToken`        rows past `expiresAt`      — Telegram chat-link onboarding.
 *   5. `Order` rows with `synthetic=true` and `placedAt < now-24h`
 *      (#1223). Real customer orders are NEVER touched — the
 *      `synthetic` column defaults to `false` and only the
 *      `/api/test-checkout/start` route flips it to true.
 *
 * Out of scope intentionally:
 *   - `Order.paymentStatus='PENDING'` past 24h for REAL orders.
 *     That's a state-machine transition (PLACED → CANCELLED), and
 *     FSM ownership lives in the orders epic (#1330). Attempting it
 *     here would bypass `assertOrderTransition` and the audit trail.
 *   - "Vendor leads" cleanup. There's no dedicated lead model;
 *     admins legitimately let `Vendor.status='APPLYING'` rows sit
 *     while they vet documents.
 *   - `IdempotencyKey` expiry — already covered by the
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

const SYNTHETIC_ORDER_TTL_MS = 24 * 60 * 60 * 1000

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
  syntheticOrders: number
}

// The result keys above contain `token`, which the unified PII
// scrubber (#1354) would collapse to `[REDACTED]` at log time —
// turning the cleanup observability into noise. Map to a `count`
// suffix shape ONLY for the log payload; the function's return type
// stays the same so callers (and tests) read the counters
// unchanged.
function toLogShape(r: CleanupAbandonedResult) {
  return {
    verificationCount: r.verificationTokens,
    emailVerificationCount: r.emailVerificationTokens,
    passwordResetCount: r.passwordResetTokens,
    telegramLinkCount: r.telegramLinkTokens,
    syntheticOrderCount: r.syntheticOrders,
  }
}

export async function runCleanupAbandonedJob(
  deps: CleanupAbandonedDeps = {},
): Promise<CleanupAbandonedResult> {
  const client = deps.client ?? db
  const log = deps.logger ?? defaultLogger
  const now = (deps.now ?? (() => new Date()))()
  const syntheticCutoff = new Date(now.getTime() - SYNTHETIC_ORDER_TTL_MS)

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

  // Synthetic orders need their child rows (lines, payments) cleaned
  // up first — Order has FK constraints from those tables. Wrap the
  // four-table cascade in a transaction so a partial purge can't
  // leave dangling rows.
  const expiredSynthetic = await client.order.findMany({
    where: { synthetic: true, placedAt: { lt: syntheticCutoff } },
    select: { id: true },
  })
  let syntheticOrders = 0
  if (expiredSynthetic.length > 0) {
    const orderIds = expiredSynthetic.map(o => o.id)
    await client.$transaction(async tx => {
      // Delete grandchildren first (Payment → Refund), then children
      // (OrderLine, Payment, OrderEvent), then parent (Order). The
      // synthetic flow doesn't produce Refund rows in v1; this is
      // belt-and-braces.
      await tx.refund.deleteMany({ where: { payment: { orderId: { in: orderIds } } } })
      await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } })
      await tx.orderLine.deleteMany({ where: { orderId: { in: orderIds } } })
      await tx.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } })
      const deleted = await tx.order.deleteMany({
        where: { id: { in: orderIds }, synthetic: true },
      })
      syntheticOrders = deleted.count
    })
  }

  const result: CleanupAbandonedResult = {
    verificationTokens: verificationTokens.count,
    emailVerificationTokens: emailVerificationTokens.count,
    passwordResetTokens: passwordResetTokens.count,
    telegramLinkTokens: telegramLinkTokens.count,
    syntheticOrders,
  }

  // Single structured log line. Counters are operational signal — a
  // sudden spike in `passwordResetCount` deletions on a quiet day
  // means somebody triggered a lot of resets that nobody completed,
  // which is a noisy-neighbour or enumeration probe smell.
  log.info('cleanup.abandoned.completed', toLogShape(result))

  return result
}
