import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

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

    // Log the message (in production, send email)
    console.log('📩 New contact form submission:', {
      nombrecliente: validated.nombre,
      email: validated.email,
      asunto: validated.asunto,
      mensaje: validated.mensaje,
      timestamp: new Date().toISOString(),
    })

    // TODO: In production, send email to the appropriate address
    // based on validated.asunto
    // const emailMap = {
    //   pedido: 'soporte@mercadoproductor.es',
    //   productores: 'productores@mercadoproductor.es',
    //   tecnico: 'soporte@mercadoproductor.es',
    //   general: 'hola@mercadoproductor.es',
    //   otros: 'hola@mercadoproductor.es',
    // }

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
