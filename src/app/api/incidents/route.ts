import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { openIncident } from '@/domains/incidents/actions'
import { IncidentAuthError, IncidentValidationError } from '@/domains/incidents/errors'
import { openIncidentBodySchema as bodySchema } from '@/shared/types/incidents'

/**
 * POST /api/incidents — buyer opens an incident on one of their orders.
 *
 * Wraps the openIncident server action so the buyer form can submit via
 * fetch() without the `'use server'` overhead. Returns the new incident id
 * so the client can redirect straight to /cuenta/incidencias/<id>.
 */
export async function POST(request: NextRequest) {
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
    const result = await openIncident(parsed)
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
