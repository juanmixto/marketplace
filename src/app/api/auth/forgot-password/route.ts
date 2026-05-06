import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createPasswordResetToken } from '@/domains/auth/email-verification'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'
import { logger } from '@/lib/logger'
import { normalizeAuthEmail } from '@/lib/auth-email'
import { verifyTurnstileToken } from '@/lib/turnstile'

const schema = z.object({
  email: z.string().email('Email inválido'),
  // #1273: Turnstile token from the invisible widget. Optional in the
  // schema so the route still parses when Turnstile is not configured
  // (fail-open by env in `verifyTurnstileToken`).
  turnstileToken: z.string().max(2048).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const clientIP = getClientIP(req)
    // Auth recovery surface → fail-closed under backend degradation.
    const rateLimitResult = await checkRateLimit('forgot-password', clientIP, 5, 3600, { failClosed: true })
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { message: rateLimitResult.message ?? 'Demasiadas solicitudes' },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
          },
        }
      )
    }

    const body = await req.json()
    const data = schema.parse(body)

    // #1273: Cloudflare Turnstile. Fail-open by env so this is inert
    // until ops provisions TURNSTILE_SECRET_KEY. When configured, a
    // missing/invalid token responds with the SAME success-shape body
    // the legitimate path returns — we don't want to enumerate which
    // requests passed Turnstile and which didn't.
    const turnstileResult = await verifyTurnstileToken(
      data.turnstileToken,
      clientIP,
    )
    if (!turnstileResult.ok) {
      logger.warn('security.turnstile.forgot_password_blocked', {
        ip: clientIP,
        reason: turnstileResult.reason,
      })
      // Generic success-shape — same as the no-such-user path below.
      return NextResponse.json(
        { message: 'Si el email existe en nuestra base de datos, recibirás un enlace para recuperar tu contraseña.' },
        { status: 200 },
      )
    }

    const normalizedEmail = normalizeAuthEmail(data.email)

    // Per-identity throttle (#173): a single attacker rotating IPs can blow
    // through the per-IP bucket trivially; this caps the number of reset
    // tokens that can be requested for the same email per hour. Response
    // shape stays identical to the success path so we don't enumerate users.
    const identityLimit = await checkRateLimit(
      'forgot-password-identity',
      normalizedEmail,
      3,
      3600,
      { failClosed: true }
    )

    if (identityLimit.success) {
      await createPasswordResetToken(normalizedEmail)
    }

    // Always return success to prevent email enumeration
    // In production, would send actual email with reset link

    return NextResponse.json(
      { message: 'Si el email existe en nuestra base de datos, recibirás un enlace para recuperar tu contraseña.' },
      { status: 200 }
    )
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos inválidos', issues: err.issues },
        { status: 400 }
      )
    }
    logger.error('auth.forgot_password.failed', { error: err })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
