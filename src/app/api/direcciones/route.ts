import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getActionSession } from '@/lib/action-session'
import { db } from '@/lib/db'
import { clearOtherDefaults, enforceSingleDefault } from '@/domains/auth/address-defaults'
import { buyerAddressSchema } from '@/domains/auth/buyer-address-schema'

export async function GET(_req: NextRequest) {
  try {
    const session = await getActionSession()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    let addresses = await db.address.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    })

    // Self-heal: if multiple defaults exist (legacy/race state), keep the
    // most recently updated one and clear the rest, then re-fetch.
    const defaultCount = addresses.reduce((n, a) => n + (a.isDefault ? 1 : 0), 0)
    if (defaultCount > 1) {
      await db.$transaction(async (tx) => {
        await enforceSingleDefault(tx, session.user.id)
      })
      addresses = await db.address.findMany({
        where: { userId: session.user.id },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      })
    }

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
    const session = await getActionSession()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const validated = buyerAddressSchema.parse(body)

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
