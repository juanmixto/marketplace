import { getActionSession } from '@/lib/action-session'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

export async function PUT(request: Request) {
  try {
    const session = await getActionSession()
    if (!session) {
      return NextResponse.json({ message: 'No autorizado', code: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { currentPassword, newPassword } = passwordSchema.parse(body)

    // Get user with password hash
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true },
    })

    if (!user) {
      return NextResponse.json(
        { message: 'Usuario no encontrado', code: 'user_not_found' },
        { status: 404 }
      )
    }

    // Verify current password
    if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return NextResponse.json(
        { message: 'Contraseña actual incorrecta', code: 'current_password_incorrect' },
        { status: 401 }
      )
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12)

    // Update password
    await db.user.update({
      where: { id: session.user.id },
      data: { passwordHash: newPasswordHash },
    })

    return NextResponse.json({
      message: 'Contraseña actualizada correctamente',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Datos inválidos', code: 'invalid_data' },
        { status: 400 }
      )
    }
    console.error('Password change error:', error)
    return NextResponse.json(
      { message: 'Error al cambiar contraseña', code: 'password_change_failed' },
      { status: 500 }
    )
  }
}

