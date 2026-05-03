import { getActionSession } from '@/lib/action-session'
import { isAdminRole } from '@/lib/roles'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  body: z.string().min(1).max(5000),
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
    const { body } = schema.parse(await request.json())

    const incident = await db.incident.findUnique({ where: { id }, select: { id: true } })
    if (!incident) {
      return NextResponse.json({ message: 'Incidencia no encontrada' }, { status: 404 })
    }

    const message = await db.incidentMessage.create({
      data: {
        body,
        incidentId: id,
        authorId:   session.user.id,
        authorRole: session.user.role,
      },
      select: {
        id: true,
        body: true,
        authorId: true,
        authorRole: true,
        attachments: true,
        createdAt: true,
      },
    })

    // Resolve author display name
    const author = await db.user.findUnique({
      where: { id: session.user.id },
      select: { firstName: true, lastName: true },
    })

    return NextResponse.json(
      {
        ...message,
        authorName: author ? `${author.firstName} ${author.lastName}` : session.user.role,
      },
      { status: 201 },
    )
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ message: 'Datos inválidos' }, { status: 400 })
    }
    logger.error('admin.api.incidents.messages.create_failed', { error: err })
    return NextResponse.json({ message: 'Error interno' }, { status: 500 })
  }
}
