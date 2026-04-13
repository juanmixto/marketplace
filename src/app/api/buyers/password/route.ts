import { getActionSession } from '@/lib/action-session'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { apiError, apiInternalError, apiNotFound, apiUnauthorized, apiValidationFromZod } from '@/lib/api-response'

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Introduce tu contraseña actual'),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
})

export async function PUT(request: Request) {
  try {
    const session = await getActionSession()
    if (!session) {
      return apiUnauthorized()
    }

    const body = await request.json()
    const parsed = passwordSchema.safeParse(body)
    if (!parsed.success) {
      return apiValidationFromZod(parsed.error)
    }
    const { currentPassword, newPassword } = parsed.data

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true },
    })

    if (!user) {
      return apiNotFound('Usuario no encontrado')
    }

    if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      // Per-field so the client highlights the current-password input
      // directly instead of a generic banner. (#131)
      return apiError('La contraseña actual es incorrecta', 401, 'UNAUTHORIZED', {
        fieldErrors: { currentPassword: 'La contraseña actual es incorrecta' },
      })
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12)

    await db.user.update({
      where: { id: session.user.id },
      data: { passwordHash: newPasswordHash },
    })

    return NextResponse.json({
      message: 'Contraseña actualizada correctamente',
    })
  } catch (error) {
    console.error('Password change error:', error)
    return apiInternalError('Error al cambiar contraseña')
  }
}
