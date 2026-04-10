import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'

const schema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email(),
  password: z.string().min(8).max(100),
})

export async function POST(req: NextRequest) {
  try {
    // Rate limiting: 3 registrations per IP per hour
    const clientIP = getClientIP(req)
    const rateLimitResult = await checkRateLimit('register', clientIP, 3, 3600)

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { message: rateLimitResult.message },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': '3',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
          },
        }
      )
    }

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
        emailVerified: null, // Require email verification before access
      },
    })

    // TODO: Create EmailVerificationToken and send verification email
    // For now, auto-verify to allow testing
    await db.user.update({
      where: { email: data.email },
      data: { emailVerified: new Date() },
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
