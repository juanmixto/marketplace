import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getActionSession } from '@/lib/action-session'
import { db } from '@/lib/db'
import {
  clearOtherDefaults,
  enforceSingleDefault,
  promoteOldestAsDefault,
} from '@/domains/auth/address-defaults'
import { buyerAddressSchema } from '@/domains/auth/buyer-address-schema'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getActionSession()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const validated = buyerAddressSchema.parse(body)

    // Scope ownership to the session user. findFirst with both predicates
    // returns null for both "not found" and "owned by someone else", so we
    // collapse them into a single 404 to avoid leaking existence.
    const existingAddress = await db.address.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existingAddress) {
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

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getActionSession()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params

    const address = await db.address.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!address) {
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
