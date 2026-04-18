'use server'

/**
 * Claim a GDPR export token and stream the JSON payload (#551).
 *
 * Single-use. No session requirement — the token is the auth; so
 * someone opening the email on a different device still works, and a
 * stolen session without email access cannot reach here.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { consumeAccountExportToken } from '@/domains/auth/account-export-tokens'
import { buildAccountExportPayload } from '@/domains/auth/account-export'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''

  const result = await consumeAccountExportToken(token)
  if (!result.ok) {
    // Map to the standard RFC 7231 status for spent/expired tokens.
    const status = result.reason === 'invalid' ? 401 : 410
    return NextResponse.json(
      { error: 'token_' + result.reason, code: result.reason },
      { status }
    )
  }

  const userId = result.userId!
  const payload = await buildAccountExportPayload(userId)
  if (!payload) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  logger.info('account.export.claimed', { userId })

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="mis-datos-${userId}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
