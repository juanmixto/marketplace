import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmail } from '@/lib/email'
import { createElement } from 'react'
import { Text } from '@react-email/components'

const contactSchema = z.object({
  nombre: z.string().min(2).max(100),
  email: z.string().email(),
  asunto: z.enum(['pedido', 'productores', 'tecnico', 'general', 'otros']),
  mensaje: z.string().min(20).max(1000),
  privacidad: z.literal(true),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Validate with Zod
    const validated = contactSchema.parse(body)

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
      console.warn('[Contact] CONTACT_EMAIL not configured; storing submission as log only')
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

    console.error('Contact form error:', error)
    return NextResponse.json(
      { error: 'Error al procesar el formulario' },
      { status: 500 }
    )
  }
}
