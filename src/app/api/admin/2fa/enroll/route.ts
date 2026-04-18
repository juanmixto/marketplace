/**
 * Start TOTP enrollment for the signed-in admin. Returns the
 * otpauth:// URI + base64 QR data URL for the authenticator app.
 * The secret is stored (encrypted) but marked pending — not
 * enforced at login until /verify succeeds.
 *
 * Also callable by an admin who wants to rotate their secret
 * (re-generates and invalidates the previous one).
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isAdminRole } from '@/lib/roles'
import { logger } from '@/lib/logger'
import { startEnrollment } from '@/domains/auth/two-factor'

export async function POST() {
  const session = await auth()
  const userId = session?.user?.id
  const role = session?.user?.role

  if (!userId || !isAdminRole(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const label = session.user.email ?? userId
  const { otpauthUrl, qrDataUrl } = await startEnrollment(userId, label)

  logger.info('admin.2fa.enroll.started', { userId })

  // Return the otpauth URL separately so the client can display both
  // the QR and a copy-pasteable text version (for password managers
  // that prefer pasting over scanning).
  return NextResponse.json({ otpauthUrl, qrDataUrl })
}
