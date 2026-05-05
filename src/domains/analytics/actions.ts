'use server'

import { getActionSession } from '@/lib/action-session'
import { isAdmin } from '@/lib/roles'
import { redirect } from 'next/navigation'
import { checkRateLimit } from '@/lib/ratelimit'
import { createAuditLog, getAuditRequestIp } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { parseFilters, toSerializable } from './filters'
import { getAnalytics } from './service'

const EXPORT_RATE_LIMIT = 1
const EXPORT_RATE_WINDOW_SECONDS = 3600
const LARGE_EXPORT_THRESHOLD = 1000

export class CsvExportRateLimitError extends Error {
  readonly retryAfterSeconds: number
  constructor(retryAfterSeconds: number) {
    super('rate_limit_exceeded')
    this.name = 'CsvExportRateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function toInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  return parts.map(p => `${p[0]?.toUpperCase() ?? ''}.`).join(' ')
}

export async function exportOrdersCsv(rawParams: Record<string, string | undefined>): Promise<string> {
  const session = await getActionSession()
  if (!session || !isAdmin(session.user.role)) redirect('/login')

  const rate = await checkRateLimit(
    'analytics-export-csv',
    session.user.id,
    EXPORT_RATE_LIMIT,
    EXPORT_RATE_WINDOW_SECONDS,
  )
  if (!rate.success) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))
    throw new CsvExportRateLimitError(retryAfter)
  }

  const filters = parseFilters(rawParams)
  const data = await getAnalytics(filters)

  const header = ['orderNumber', 'placedAt', 'customerInitials', 'vendor', 'status', 'grandTotal']
  const rows = data.orders.map(o =>
    [
      o.orderNumber,
      o.placedAt,
      `"${toInitials(o.customerName)}"`,
      `"${o.vendorName.replace(/"/g, '""')}"`,
      o.status,
      o.grandTotal.toFixed(2),
    ].join(','),
  )

  const ip = await getAuditRequestIp()
  const rowCount = rows.length
  const serialized = toSerializable(filters)

  await createAuditLog({
    action: 'DATA_EXPORT',
    entityType: 'analytics.orders',
    entityId: `csv-${Date.now()}`,
    after: JSON.parse(JSON.stringify({ rowCount, filters: serialized })),
    actorId: session.user.id,
    actorRole: session.user.role,
    ip,
  })

  if (rowCount >= LARGE_EXPORT_THRESHOLD) {
    logger.warn('analytics.export.large_csv', {
      actorId: session.user.id,
      actorRole: session.user.role,
      rowCount,
      threshold: LARGE_EXPORT_THRESHOLD,
    })
  }

  return [header.join(','), ...rows].join('\n')
}
