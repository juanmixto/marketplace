import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

const resetSchema = z.object({
  token: z.string().min(1, 'Token es requerido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  confirmPassword: z.string().min(8),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = resetSchema.parse(body)

    // Find user by reset token
    const user = await db.user.findUnique({
      where: { passwordResetToken: validated.token },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Token inválido o expirado' },
        { status: 400 }
      )
    }

    // Check if token has expired
    if (!user.passwordResetExpires || new Date() > user.passwordResetExpires) {
      return NextResponse.json(
        { error: 'El enlace de recuperación ha expirado. Por favor, solicita uno nuevo.' },
        { status: 400 }
      )
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(validated.password, 12)

    // Update user: set new password and clear reset fields
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    })

    console.log(`✅ Password reset successful for user ${user.email}`)

    return NextResponse.json(
      {
        success: true,
        message: 'Contraseña actualizada correctamente. Por favor, inicia sesión con tu nueva contraseña.',
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

    console.error('Password reset error:', error)
    return NextResponse.json(
      { error: 'Error al actualizar la contraseña' },
      { status: 500 }
    )
  }
}
