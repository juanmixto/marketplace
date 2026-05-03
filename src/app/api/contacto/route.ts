import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmail } from '@/lib/email'
import { createElement } from 'react'
import { Text } from '@react-email/components'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'
import { logger } from '@/lib/logger'
import { normalizeAuthEmail } from '@/lib/auth-email'

const contactSchema = z.object({
  nombre: z.string().min(2).max(100),
  email: z.string().email(),
  asunto: z.enum(['pedido', 'productores', 'tecnico', 'general', 'otros']),
  mensaje: z.string().min(20).max(1000),
  privacidad: z.literal(true),
})

const CONTACT_LIMIT_PER_IP = 5
const CONTACT_LIMIT_PER_EMAIL = 3
const CONTACT_WINDOW_SECONDS = 3600

function rateLimitedResponse(message: string, resetAt: number, limit: number) {
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        'Retry-After': Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)).toString(),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': resetAt.toString(),
      },
    }
  )
}

export async function POST(req: NextRequest) {
  try {
    // Per-IP throttle (#173): the contact form fans out to email, so an
    // unbounded POST loop turns into a free mail-bomb against CONTACT_EMAIL.
    const clientIP = getClientIP(req)
    const ipLimit = await checkRateLimit(
      'contact-ip',
      clientIP,
      CONTACT_LIMIT_PER_IP,
      CONTACT_WINDOW_SECONDS
    )
    if (!ipLimit.success) {
      return rateLimitedResponse(
        'Demasiados envíos desde esta conexión. Intenta de nuevo más tarde.',
        ipLimit.resetAt,
        CONTACT_LIMIT_PER_IP
      )
    }

    const body = await req.json()
    const validated = contactSchema.parse(body)

    // Per-identity throttle so a distributed source can't keep recycling the
    // same sender address either.
    const normalizedEmail = normalizeAuthEmail(validated.email)
    const emailLimit = await checkRateLimit(
      'contact-email',
      normalizedEmail,
      CONTACT_LIMIT_PER_EMAIL,
      CONTACT_WINDOW_SECONDS
    )
    if (!emailLimit.success) {
      return rateLimitedResponse(
        'Demasiados envíos para este correo. Intenta de nuevo más tarde.',
        emailLimit.resetAt,
        CONTACT_LIMIT_PER_EMAIL
      )
    }

    const contactEmail = process.env.CONTACT_EMAIL

    if (contactEmail) {
      await sendEmail({
        to: contactEmail,
        subject: `[Contacto] ${validated.asunto} - ${validated.nombre}`,
        react: createElement(
          'div',
          null,
          createElement(Text, null, 'Nuevo mensaje desde el formulario de contacto.'),
          createElement(Text, null, `Nombre: ${validated.nombre}`),
          createElement(Text, null, `Email: ${validated.email}`),
          createElement(Text, null, `Asunto: ${validated.asunto}`),
          createElement(Text, null, `Mensaje: ${validated.mensaje}`)
        ),
      })
    } else {
      logger.warn('contact.submission.no_recipient', { reason: 'no_contact_email_configured' })
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Mensaje recibido correctamente. Nos pondremos en contacto pronto.',
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

    logger.error('contact.submission.failed', { error })
    return NextResponse.json(
      { error: 'Error al procesar el formulario' },
      { status: 500 }
    )
  }
}
