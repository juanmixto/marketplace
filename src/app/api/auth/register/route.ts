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
import { registerSchema as schema } from '@/shared/types/auth'

import { isUniqueConstraintViolation } from '@/lib/prisma-errors'

export async function POST(req: NextRequest) {
  let createdUser: { id: string; firstName: string; email: string } | null = null

  try {
    // Rate limiting: 3 registrations per IP per hour. Auth surface →
    // fail-closed if the rate-limit backend is unreachable so a Redis
    // outage cannot be turned into an unbounded registration flood.
    const clientIP = getClientIP(req)
    const rateLimitResult = await checkRateLimit('register', clientIP, 3, 3600, { failClosed: true })

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

    const passwordHash = await bcrypt.hash(data.password, 12)

    try {
      createdUser = await db.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          passwordHash,
          role: 'CUSTOMER',
          emailVerified: null, // Require email verification before access
        },
        select: { id: true, firstName: true, email: true },
      })
    } catch (createErr) {
      if (isUniqueConstraintViolation(createErr)) {
        return NextResponse.json({ message: 'Este email ya está registrado' }, { status: 409 })
      }
      throw createErr
    }

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

