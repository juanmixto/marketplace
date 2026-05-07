/**
 * Two-step admin login — step 1 (password precheck).
 *
 * Drives the UX split between "email + password" and "TOTP" forms.
 * The client POSTs credentials here; if the password is valid AND the
 * user has 2FA enrolled AND no trusted-device cookie is present, we
 * respond `{ ok: true, needs2fa: true }` so the client can reveal the
 * TOTP field. A wrong password, inactive account, or unverified email
 * all collapse into the same `{ ok: false }` response so the endpoint
 * never leaks which accounts exist or are under attack.
 *
 * Rate-limited per-IP and per-identity on the same order of magnitude
 * as the login flow itself, so turning this endpoint into a password
 * oracle gains an attacker nothing over hammering `/api/auth/callback/
 * credentials` directly.
 *
 * Deliberately NOT session-authenticated — must be callable when
 * logged out. Listed in test/integration/api-route-auth-audit.test.ts
 * PUBLIC_API_ROUTES allow-list with the reason above.
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'
import { isTwoFactorEnabled } from '@/domains/auth/two-factor'
import { verifyTrustedDeviceCookie } from '@/domains/auth/trusted-device'
import { normalizeAuthEmail } from '@/lib/auth-email'

// #1284 — bound the password before it ever reaches bcrypt.
const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
})

const PER_IP_LIMIT = 20
const PER_IP_WINDOW = 15 * 60
const PER_IDENTITY_LIMIT = 10
const PER_IDENTITY_WINDOW = 15 * 60

export async function POST(req: NextRequest) {
  try {
    const clientIP = getClientIP(req)
    const ipLimit = await checkRateLimit(
      'login-precheck-ip',
      clientIP,
      PER_IP_LIMIT,
      PER_IP_WINDOW,
      { failClosed: true }
    )
    if (!ipLimit.success) {
      return NextResponse.json({ ok: false }, { status: 429 })
    }

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    const normalizedEmail = normalizeAuthEmail(parsed.data.email)

    const identityLimit = await checkRateLimit(
      'login-precheck-identity',
      normalizedEmail,
      PER_IDENTITY_LIMIT,
      PER_IDENTITY_WINDOW,
      { failClosed: true }
    )
    if (!identityLimit.success) {
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    const user = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (!user || !user.passwordHash || !user.isActive || !user.emailVerified) {
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    const has2fa = await isTwoFactorEnabled(user.id)
    if (!has2fa) {
      return NextResponse.json({ ok: true, needs2fa: false }, { status: 200 })
    }

    const trusted = await verifyTrustedDeviceCookie(user.id, user.passwordHash)
    return NextResponse.json(
      { ok: true, needs2fa: !trusted },
      { status: 200 }
    )
  } catch (err) {
    logger.error('auth.login_precheck.failed', { error: err })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
