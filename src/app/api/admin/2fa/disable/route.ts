/**
 * Disable TOTP for the signed-in admin. Requires a current valid
 * code (prevents an attacker with a hijacked session from simply
 * turning off the factor). After this the proxy will force
 * re-enrollment on the next /admin route access.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { isAdminRole } from '@/lib/roles'
import { logger } from '@/lib/logger'
import { disableTwoFactor, verifyLoginCode } from '@/domains/auth/two-factor'

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

  const ok = await verifyLoginCode(userId, parsed.data.code)
  if (!ok) {
    logger.warn('admin.2fa.disable.invalid_code', { userId })
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  await disableTwoFactor(userId)
  logger.info('admin.2fa.disabled', { userId })

  return NextResponse.json({ ok: true })
}
