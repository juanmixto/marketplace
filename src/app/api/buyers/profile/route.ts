import { getActionSession } from '@/lib/action-session'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, apiInternalError, apiUnauthorized, apiValidationFromZod } from '@/lib/api-response'

const profileSchema = z.object({
  firstName: z.string().min(1, 'El nombre es obligatorio').max(50, 'Máximo 50 caracteres'),
  lastName: z.string().min(1, 'El apellido es obligatorio').max(50, 'Máximo 50 caracteres'),
  email: z.string().email('Email inválido'),
})

export async function PUT(request: Request) {
  try {
    const session = await getActionSession()
    if (!session) {
      return apiUnauthorized()
    }

    const body = await request.json()
    const parsed = profileSchema.safeParse(body)
    if (!parsed.success) {
      return apiValidationFromZod(parsed.error)
    }
    const { firstName, lastName, email } = parsed.data

    // Email-conflict surfaces as a per-field error so the client can highlight
    // the email input directly instead of a generic banner. (#131)
    if (email !== session.user.email) {
      const existing = await db.user.findUnique({ where: { email } })
      if (existing) {
        return apiError('Este email ya está en uso por otra cuenta', 409, 'CONFLICT', {
          fieldErrors: { email: 'Este email ya está en uso por otra cuenta' },
        })
      }
    }

    const user = await db.user.update({
      where: { id: session.user.id },
      data: { firstName, lastName, email },
    })

    return NextResponse.json({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    })
  } catch (error) {
    console.error('Profile update error:', error)
    return apiInternalError('Error al actualizar perfil')
  }
}
