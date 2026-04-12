import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createPasswordResetToken } from '@/domains/auth/email-verification'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'

const schema = z.object({
  email: z.string().email('Email inválido'),
})

export async function POST(req: NextRequest) {
  try {
    const clientIP = getClientIP(req)
    const rateLimitResult = await checkRateLimit('forgot-password', clientIP, 5, 3600)
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
    await createPasswordResetToken(data.email)

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
    console.error('[forgot-password]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
