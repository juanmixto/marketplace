import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  clearOtherDefaults,
  enforceSingleDefault,
  promoteOldestAsDefault,
} from '@/lib/address-defaults'

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

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const validated = addressSchema.parse(body)

    // Verify ownership
    const existingAddress = await db.address.findUnique({
      where: { id },
    })

    if (!existingAddress || existingAddress.userId !== session.user.id) {
      return NextResponse.json({ error: 'Dirección no encontrada' }, { status: 404 })
    }

    const address = await db.$transaction(async (tx) => {
      if (validated.isDefault) {
        // Always heal — the existing address may already be default while
        // another stale row is *also* flagged default (legacy/race state).
        await clearOtherDefaults(tx, session.user.id, id)
      }

      return tx.address.update({
        where: { id },
        data: {
          ...validated,
          label: validated.label || undefined,
          line2: validated.line2 || undefined,
        },
      })
    })

    return NextResponse.json(address)
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

    console.error('PUT /api/direcciones/[id] error:', error)
    return NextResponse.json(
      { error: 'Error al actualizar dirección' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params

    // Verify ownership
    const address = await db.address.findUnique({
      where: { id },
    })

    if (!address || address.userId !== session.user.id) {
      return NextResponse.json({ error: 'Dirección no encontrada' }, { status: 404 })
    }

    await db.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } })
      if (address.isDefault) {
        await promoteOldestAsDefault(tx, session.user.id)
      }
      await enforceSingleDefault(tx, session.user.id)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/direcciones/[id] error:', error)
    return NextResponse.json(
      { error: 'Error al eliminar dirección' },
      { status: 500 }
    )
  }
}
