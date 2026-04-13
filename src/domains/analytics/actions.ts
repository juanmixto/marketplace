'use server'

import { getActionSession } from '@/lib/action-session'
import { isAdmin } from '@/lib/roles'
import { redirect } from 'next/navigation'
import { parseFilters } from './filters'
import { getAnalytics } from './service'

export async function exportOrdersCsv(rawParams: Record<string, string | undefined>): Promise<string> {
  const session = await getActionSession()
  if (!session || !isAdmin(session.user.role)) redirect('/login')

  const filters = parseFilters(rawParams)
  const data = await getAnalytics(filters)

  const header = ['orderNumber', 'placedAt', 'customer', 'vendor', 'status', 'grandTotal']
  const rows = data.orders.map(o =>
    [
      o.orderNumber,
      o.placedAt,
      `"${o.customerName.replace(/"/g, '""')}"`,
      `"${o.vendorName.replace(/"/g, '""')}"`,
      o.status,
      o.grandTotal.toFixed(2),
    ].join(','),
  )
  return [header.join(','), ...rows].join('\n')
}
