/**
 * Request a GDPR Article 15 data export via email (#551).
 *
 * Session cookie alone is not enough — the user must prove inbox
 * access. This endpoint generates a single-use token, emails a claim
 * link to the verified account address, and responds with no detail
 * about success/failure beyond a generic "if you own this account,
 * check your inbox" so an attacker with a stolen session cannot
 * enumerate or confirm anything.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { checkRateLimit } from '@/lib/ratelimit'
import { createAccountExportToken } from '@/domains/auth/account-export-tokens'
import { AccountExportEmail } from '@/emails/AccountExport'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const userId = session.user.id

  // 3 requests / hour — matches the old direct-export rate limit. A
  // spammy attacker with a stolen session can't flood the victim's
  // inbox past this ceiling.
  const rateLimitResult = await checkRateLimit('account-export-request', userId, 3, 3600)
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: rateLimitResult.message ?? 'Demasiadas solicitudes' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
          'X-RateLimit-Limit': '3',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
        },
      }
    )
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, emailVerified: true, deletedAt: true },
  })

  // We don't distinguish "no such user" vs "deleted" vs "unverified" in
  // the response; the client always sees success. Anything else would
  // leak account state to whoever holds the session.
  if (!user || user.deletedAt || !user.emailVerified) {
    logger.warn('account.export.request.skipped', { userId, reason: 'unverified_or_deleted' })
    return NextResponse.json({ ok: true })
  }

  try {
    const token = await createAccountExportToken(userId)
    const claimLink = `${getServerEnv().appUrl}/api/account/export/claim?token=${encodeURIComponent(token)}`

    await sendEmail({
      to: user.email,
      subject: 'Tu descarga de datos personales',
      react: AccountExportEmail({
        userName: user.firstName || 'Usuario',
        claimLink,
      }),
    })

    logger.info('account.export.request.sent', { userId })
  } catch (err) {
    logger.error('account.export.request.error', { userId, err })
    return NextResponse.json(
      { error: 'No se pudo enviar el email' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
