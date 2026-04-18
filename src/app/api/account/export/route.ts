'use server'

/**
 * Legacy GDPR export endpoint. Kept only to return 410 Gone so any
 * client still hitting it gets a clear signal to migrate to the
 * email-link flow (#551). The direct-stream behaviour was removed
 * because a stolen session alone should not be enough to exfiltrate
 * the user's PII dump.
 */

import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json(
    {
      error: 'gone',
      code: 'export_direct_stream_removed',
      migrate_to: '/api/account/export/request',
    },
    { status: 410 }
  )
}
