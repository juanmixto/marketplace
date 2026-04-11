import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'
import { createEmailVerificationToken } from '@/domains/auth/email-verification'
import { sendEmail } from '@/lib/email'
import { getServerEnv } from '@/lib/env'
import { EmailVerificationEmail } from '@/emails/EmailVerification'
import { createElement } from 'react'

const schema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email(),
  password: z.string().min(8).max(100),
})

export async function POST(req: NextRequest) {
  let createdUser: { id: string; firstName: string; email: string } | null = null

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

    createdUser = await db.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        passwordHash,
        role: 'CUSTOMER',
        emailVerified: null, // Require email verification before access
      },
    })

    const token = await createEmailVerificationToken(createdUser.id)
    const verificationLink = new URL('/api/auth/verify-email', getServerEnv().appUrl)
    verificationLink.searchParams.set('token', token)

    await sendEmail({
      to: createdUser.email,
      subject: 'Verifica tu email en Marketplace',
      react: createElement(EmailVerificationEmail, {
        userName: createdUser.firstName,
        verificationLink: verificationLink.toString(),
      }),
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Te hemos enviado un email de verificación. Revisa tu bandeja antes de iniciar sesión.',
      },
      { status: 201 }
    )
  } catch (err) {
    if (createdUser) {
      await db.emailVerificationToken.deleteMany({ where: { userId: createdUser.id } }).catch(() => {})
      await db.user.delete({ where: { id: createdUser.id } }).catch(() => {})
    }

    if (err instanceof z.ZodError) {
      return NextResponse.json({ message: 'Datos inválidos', issues: err.issues }, { status: 400 })
    }
    console.error('[register]', err)
    return NextResponse.json({ message: 'Error interno' }, { status: 500 })
  }
}
