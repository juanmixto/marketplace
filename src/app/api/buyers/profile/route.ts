import { getActionSession } from '@/lib/action-session'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const profileSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email(),
})

export async function PUT(request: Request) {
  try {
    const session = await getActionSession()
    if (!session) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { firstName, lastName, email } = profileSchema.parse(body)

    // Check if email is already taken by another user
    if (email !== session.user.email) {
      const existing = await db.user.findUnique({ where: { email } })
      if (existing) {
        return NextResponse.json(
          { message: 'Email ya está en uso' },
          { status: 400 }
        )
      }
    }

    const user = await db.user.update({
      where: { id: session.user.id },
      data: {
        firstName,
        lastName,
        email,
      },
    })

    return NextResponse.json({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Datos inválidos' },
        { status: 400 }
      )
    }
    console.error('Profile update error:', error)
    return NextResponse.json(
      { message: 'Error al actualizar perfil' },
      { status: 500 }
    )
  }
}
