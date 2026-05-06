import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'
import { createEmailVerificationToken } from '@/domains/auth/email-verification'
import { sendEmail } from '@/lib/email'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { EmailVerificationEmail } from '@/emails/EmailVerification'
import { RegisterAttemptOnExistingAccountEmail } from '@/emails/RegisterAttemptOnExistingAccount'
import { createElement } from 'react'
import { registerSchema as schema } from '@/shared/types/auth'
import { isDisposableEmail } from '@/lib/disposable-emails'
import { normalizeAuthEmail } from '@/lib/auth-email'

import { isUniqueConstraintViolation } from '@/lib/prisma-errors'
import { HONEYPOT_FIELD_NAME, isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstileToken } from '@/lib/turnstile'

// #1283: response body shared by every non-error branch — fresh user,
// existing-account, disposable-email — so the response itself never
// reveals which path was taken. The differentiation lives in the
// mailbox (welcome+verify vs "ya tienes cuenta" vs nothing).
const NEUTRAL_REGISTER_RESPONSE = {
  success: true,
  message: 'Te hemos enviado un email de verificación. Revisa tu bandeja antes de iniciar sesión.',
} as const

export async function POST(req: NextRequest) {
  let createdUser: { id: string; firstName: string; email: string } | null = null

  try {
    // Rate limiting: 3 registrations per IP per hour. Auth surface →
    // fail-closed if the rate-limit backend is unreachable so a Redis
    // outage cannot be turned into an unbounded registration flood.
    const clientIP = getClientIP(req)
    const rateLimitResult = await checkRateLimit('register', clientIP, 3, 3600, { failClosed: true })

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { message: rateLimitResult.message },
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

    const body = await req.json()

    // #1273: Cloudflare Turnstile invisible captcha. Fail-open by env
    // (no TURNSTILE_SECRET_KEY ⇒ verifyTurnstileToken returns ok:true)
    // so this branch is inert until ops provisions the secret. Once
    // configured, a missing / invalid / expired token returns 400
    // with the same generic copy as a Zod failure — no specifics to
    // help a script tune.
    const turnstileResult = await verifyTurnstileToken(
      body?.turnstileToken,
      clientIP,
    )
    if (!turnstileResult.ok) {
      logger.warn('security.turnstile.register_blocked', {
        ip: clientIP,
        reason: turnstileResult.reason,
      })
      return NextResponse.json(
        { message: 'Verificación fallida. Recarga la página e inténtalo de nuevo.' },
        { status: 400 },
      )
    }

    // Honeypot (#1271): silent success. A non-empty `website` is a bot.
    if (isHoneypotTripped(body?.[HONEYPOT_FIELD_NAME])) {
      logger.warn('security.honeypot.tripped', { surface: 'register', ip: clientIP })
      return NextResponse.json(
        {
          success: true,
          message: 'Te hemos enviado un email de verificación. Revisa tu bandeja antes de iniciar sesión.',
        },
        { status: 201 }
      )
    }

    const data = schema.parse(body)

    // #1280: refuse disposable inboxes. We respond with the same neutral
    // shape as the success branch so an enumeration script can't tell
    // which list the address landed on. Status is 200 (not 400) for the
    // same reason — a 4xx is a tell. The legitimate user with a temp
    // mail simply never receives the verification email and contacts
    // support; an attacker burning through 10minutemail variants gets
    // nothing actionable.
    if (isDisposableEmail(data.email)) {
      logger.warn('auth.register.disposable_blocked', { ip: clientIP })
      return NextResponse.json(NEUTRAL_REGISTER_RESPONSE, { status: 200 })
    }

    // #1283: enumeration-safe duplicate handling. Pre-flight check
    // against the unique index. If the email is already on file we send
    // a "ya tienes cuenta" email (so a legit user who forgot they
    // signed up has a path forward) and respond with the same shape as
    // a fresh registration. The previous 409 on collision was a clean
    // boolean leak — a script could enumerate registered addresses
    // without ever opening an inbox.
    const normalizedEmail = normalizeAuthEmail(data.email)
    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, firstName: true },
    })

    if (existing) {
      logger.info('auth.register.duplicate_email', { ip: clientIP, userId: existing.id })
      const env = getServerEnv()
      const loginUrl = new URL('/login', env.appUrl).toString()
      const forgotPasswordUrl = new URL('/forgot-password', env.appUrl).toString()
      // Best-effort: a transient email failure must NOT change the
      // response (otherwise a slow vs fast 200 leaks the duplicate just
      // as much as the old 409 did).
      await sendEmail({
        to: data.email,
        subject: 'Ya tienes una cuenta en Marketplace',
        react: createElement(RegisterAttemptOnExistingAccountEmail, {
          userName: existing.firstName,
          loginUrl,
          forgotPasswordUrl,
        }),
      }).catch(err => {
        logger.error('auth.register.duplicate_email_send_failed', { error: err })
      })
      return NextResponse.json(NEUTRAL_REGISTER_RESPONSE, { status: 200 })
    }

    const passwordHash = await bcrypt.hash(data.password, 12)

    try {
      createdUser = await db.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          passwordHash,
          role: 'CUSTOMER',
          emailVerified: null, // Require email verification before access
        },
        select: { id: true, firstName: true, email: true },
      })
    } catch (createErr) {
      // Race: another caller created this email between our pre-flight
      // check and the create. Mirror the existing-account branch so the
      // response shape is still indistinguishable from a fresh signup.
      if (isUniqueConstraintViolation(createErr)) {
        logger.info('auth.register.duplicate_email_race', { ip: clientIP })
        return NextResponse.json(NEUTRAL_REGISTER_RESPONSE, { status: 200 })
      }
      throw createErr
    }

    const token = await createEmailVerificationToken(createdUser.id)
    const verificationLink = new URL('/api/auth/verify-email', getServerEnv().appUrl)
    verificationLink.searchParams.set('token', token)

    await sendEmail({
      to: createdUser.email,
      subject: 'Verifica tu email en Marketplace',
      react: createElement(EmailVerificationEmail, {
        userName: createdUser.firstName,
        verificationLink: verificationLink.toString(),
      }),
    })

    return NextResponse.json(NEUTRAL_REGISTER_RESPONSE, { status: 200 })
  } catch (err) {
    if (createdUser) {
      await db.emailVerificationToken.deleteMany({ where: { userId: createdUser.id } }).catch(() => {})
      await db.user.delete({ where: { id: createdUser.id } }).catch(() => {})
    }

    if (err instanceof z.ZodError) {
      return NextResponse.json({ message: 'Datos inválidos', issues: err.issues }, { status: 400 })
    }
    logger.error('auth.register.failed', { error: err })
    return NextResponse.json({ message: 'Error interno' }, { status: 500 })
  }
}

