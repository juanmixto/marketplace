import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createPasswordResetToken } from '@/domains/auth/email-verification'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'
import { logger } from '@/lib/logger'
import { normalizeAuthEmail } from '@/lib/auth-email'

const schema = z.object({
  email: z.string().email('Email inválido'),
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
