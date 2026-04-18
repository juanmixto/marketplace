import { getActionSession } from '@/lib/action-session'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, apiInternalError, apiUnauthorized, apiValidationFromZod } from '@/lib/api-response'
import { PROFILE_FIELD_LIMITS } from '@/shared/types/profile'

// Shape mirrors @/shared/types/profile (single source of truth for field
// limits via PROFILE_FIELD_LIMITS); messages stay localized to ES here
// because the API surface speaks Spanish to the buyer client.
const profileSchema = z.object({
  firstName: z
    .string()
    .min(PROFILE_FIELD_LIMITS.firstName.min, 'El nombre es obligatorio')
    .max(PROFILE_FIELD_LIMITS.firstName.max, `Máximo ${PROFILE_FIELD_LIMITS.firstName.max} caracteres`),
  lastName: z
    .string()
    .min(PROFILE_FIELD_LIMITS.lastName.min, 'El apellido es obligatorio')
    .max(PROFILE_FIELD_LIMITS.lastName.max, `Máximo ${PROFILE_FIELD_LIMITS.lastName.max} caracteres`),
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
    const { firstName, lastName } = parsed.data
    const email = parsed.data.email.trim().toLowerCase()
    const currentEmail = session.user.email?.trim().toLowerCase()

    // Email-conflict should not act as an oracle for account existence.
    // Compare against the normalized value and return a generic error if
    // the target email is already in use by another account.
    if (email !== currentEmail) {
      const existing = await db.user.findUnique({ where: { email } })
      if (existing && existing.id !== session.user.id) {
        return apiError('No se ha podido actualizar el email', 409, 'CONFLICT', {
          fieldErrors: { email: 'No se ha podido actualizar el email' },
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
