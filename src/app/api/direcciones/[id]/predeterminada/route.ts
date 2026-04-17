import { NextRequest, NextResponse } from 'next/server'
import { getActionSession } from '@/lib/action-session'
import { db } from '@/lib/db'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PUT(_req: NextRequest, { params }: RouteParams) {
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
    console.error('PUT /api/direcciones/[id]/predeterminada error:', error)
    return NextResponse.json(
      { error: 'Error al establecer dirección predeterminada' },
      { status: 500 }
    )
  }
}
