import { getActionSession } from '@/lib/action-session'
import { isAdminRole } from '@/lib/roles'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { IncidentResolution } from '@/generated/prisma/enums'

const schema = z.object({
  resolution:   z.nativeEnum(IncidentResolution),
  internalNote: z.string().max(2000).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await getActionSession()
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params

  try {
    const { resolution, internalNote } = schema.parse(await request.json())

    const incident = await db.incident.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!incident) {
      return NextResponse.json({ message: 'Incidencia no encontrada' }, { status: 404 })
    }
    if (incident.status === 'RESOLVED' || incident.status === 'CLOSED') {
      return NextResponse.json({ message: 'La incidencia ya está cerrada' }, { status: 400 })
    }

    const updated = await db.incident.update({
      where: { id },
      data: {
        status:       'RESOLVED',
        resolution,
        internalNote: internalNote ?? null,
        resolvedAt:   new Date(),
      },
      select: { id: true, status: true, resolution: true, resolvedAt: true },
    })

    return NextResponse.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ message: 'Datos inválidos' }, { status: 400 })
    }
    console.error('[POST /api/admin/incidents/[id]/resolve]', err)
    return NextResponse.json({ message: 'Error interno' }, { status: 500 })
  }
}
