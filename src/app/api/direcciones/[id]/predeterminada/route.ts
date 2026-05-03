import { NextRequest, NextResponse } from 'next/server'
import { getActionSession } from '@/lib/action-session'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { zCuid } from '@/lib/validation/primitives'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PUT(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getActionSession()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idCheck = zCuid.safeParse((await params).id)
    if (!idCheck.success) {
      return NextResponse.json({ error: 'Identificador inválido' }, { status: 400 })
    }
    const id = idCheck.data

    const address = await db.address.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!address) {
      return NextResponse.json({ error: 'Dirección no encontrada' }, { status: 404 })
    }

    // Use transaction to atomically update all addresses
    await db.$transaction([
      db.address.updateMany({
        where: { userId: session.user.id },
        data: { isDefault: false },
      }),
      db.address.update({
        where: { id },
        data: { isDefault: true },
      }),
    ])

    const updatedAddress = await db.address.findUnique({
      where: { id },
    })

    return NextResponse.json(updatedAddress)
  } catch (error) {
    logger.error('api.direcciones.set_default_failed', { error })
    return NextResponse.json(
      { error: 'Error al establecer dirección predeterminada' },
      { status: 500 }
    )
  }
}
