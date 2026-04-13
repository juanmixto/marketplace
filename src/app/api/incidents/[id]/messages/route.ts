import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { addIncidentMessage } from '@/domains/incidents/actions'
import { IncidentAuthError, IncidentValidationError } from '@/domains/incidents/errors'

const bodySchema = z.object({
  body: z.string().min(1).max(5000),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/incidents/[id]/messages — buyer adds a reply to one of their
 * incidents. The admin equivalent lives under /api/admin/incidents/...;
 * the underlying domain action is the same and enforces the role check.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  let parsed
  try {
    parsed = bodySchema.parse(await request.json())
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'invalid-body', issues: error.issues },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  }

  try {
    const result = await addIncidentMessage({ incidentId: id, body: parsed.body })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof IncidentAuthError) {
      return NextResponse.json({ error: 'not-found' }, { status: 404 })
    }
    if (error instanceof IncidentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}
