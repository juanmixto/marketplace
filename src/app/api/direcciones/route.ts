import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { clearOtherDefaults } from '@/lib/address-defaults'

const addressSchema = z.object({
  label: z.string().max(50).optional(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  line1: z.string().min(1).max(200),
  line2: z.string().max(100).optional(),
  city: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  postalCode: z.string().regex(/^\d{5}$/, 'Código postal español: 5 dígitos'),
  isDefault: z.boolean().default(false),
})

type AddressInput = z.infer<typeof addressSchema>

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const addresses = await db.address.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json(addresses)
  } catch (error) {
    console.error('GET /api/direcciones error:', error)
    return NextResponse.json(
      { error: 'Error al obtener direcciones' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const validated = addressSchema.parse(body)

    const address = await db.$transaction(async (tx) => {
      if (validated.isDefault) {
        await clearOtherDefaults(tx, session.user.id)
      }

      return tx.address.create({
        data: {
          ...validated,
          userId: session.user.id,
          label: validated.label || undefined,
          line2: validated.line2 || undefined,
        },
      })
    })

    return NextResponse.json(address, { status: 201 })
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

    console.error('POST /api/direcciones error:', error)
    return NextResponse.json(
      { error: 'Error al crear dirección' },
      { status: 500 }
    )
  }
}
