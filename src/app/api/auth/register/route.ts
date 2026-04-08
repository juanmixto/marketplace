import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

const schema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email(),
  password: z.string().min(8).max(100),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = schema.parse(body)

    const existing = await db.user.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json({ message: 'Este email ya está registrado' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(data.password, 12)

    await db.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        passwordHash,
        role: 'CUSTOMER',
        emailVerified: new Date(), // skip email verification for now
      },
    })

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ message: 'Datos inválidos', issues: err.issues }, { status: 400 })
    }
    console.error('[register]', err)
    return NextResponse.json({ message: 'Error interno' }, { status: 500 })
  }
}
