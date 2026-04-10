import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { completePasswordReset, validatePasswordResetToken } from '@/domains/auth/email-verification'

const schema = z.object({
  token: z.string().min(1, 'Token requerido'),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(100),
  passwordConfirm: z.string(),
}).refine(data => data.password === data.passwordConfirm, {
  message: 'Las contraseñas no coinciden',
  path: ['passwordConfirm'],
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = schema.parse(body)

    // Validate token first
    const validation = await validatePasswordResetToken(data.token)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.message },
        { status: 400 }
      )
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(data.password, 12)

    // Complete the reset
    const result = await completePasswordReset(data.token, passwordHash)

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Contraseña actualizada correctamente. Ahora puedes iniciar sesión.',
        redirect: '/login',
      },
      { status: 200 }
    )
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos inválidos', issues: err.issues },
        { status: 400 }
      )
    }
    console.error('[reset-password]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
