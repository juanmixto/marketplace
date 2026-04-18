/**
 * Complete TOTP enrollment by verifying one code from the admin's
 * authenticator. On success the `enabledAt` timestamp is set, which
 * the login flow reads to require the code from this point on.
 *
 * The admin must log out + back in after this succeeds so their
 * JWT picks up the new `has2fa: true` claim. The response hint
 * tells the client to redirect to /api/auth/signout.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { isAdminRole } from '@/lib/roles'
import { logger } from '@/lib/logger'
import { verifyEnrollment } from '@/domains/auth/two-factor'

const bodySchema = z.object({
  code: z.string().trim().regex(/^\d{6,10}$/),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  const role = session?.user?.role

  if (!userId || !isAdminRole(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  const ok = await verifyEnrollment(userId, parsed.data.code)
  if (!ok) {
    logger.warn('admin.2fa.enroll.invalid_code', { userId })
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  logger.info('admin.2fa.enroll.completed', { userId })

  // reauth=true tells the client to sign out and prompt the admin to
  // log back in — that round-trip mints a new JWT with has2fa: true,
  // which the proxy uses to lift the enrollment gate.
  return NextResponse.json({ ok: true, reauth: true })
}
