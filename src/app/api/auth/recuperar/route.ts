import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

const requestSchema = z.object({
  email: z.string().email('Email inválido'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email } = requestSchema.parse(body)

    // Always return 200 to avoid email enumeration attacks
    try {
      const user = await db.user.findUnique({
        where: { email },
      })

      if (user) {
        // Generate reset token
        const token = crypto.randomUUID()
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now

        // Store token in database
        await db.user.update({
          where: { id: user.id },
          data: {
            passwordResetToken: token,
            passwordResetExpires: expiresAt,
          },
        })

        // Token stored in database. In production, send reset link via email.
      }
    } catch (dbError) {
      console.error('Database error during password reset request:', dbError)
    }

    // Always return success regardless of email existence
    return NextResponse.json(
      {
        success: true,
        message: 'Si el email está registrado, recibirás un enlace de recuperación en breve.',
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Datos inválidos',
          details: error.issues,
        },
        { status: 400 }
      )
    }

    console.error('Password reset request error:', error)
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    )
  }
}
