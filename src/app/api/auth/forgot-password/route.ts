import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createPasswordResetToken } from '@/domains/auth/email-verification'

const schema = z.object({
  email: z.string().email('Email inválido'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = schema.parse(body)

    const result = await createPasswordResetToken(data.email)

    // Always return success to prevent email enumeration
    // In production, would send actual email with reset link
    console.log('[forgot-password]', {
      email: data.email,
      token: result.token, // Log for development/testing
      resetLink: `${process.env.NEXTAUTH_URL}/auth/reset-password/${result.token}`,
    })

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
