import { NextResponse } from 'next/server'
import { getActionSession } from '@/lib/action-session'
import { isFinanceAdminRole } from '@/lib/roles'
import { logger } from '@/lib/logger'
import { getAdminDailyRevenue } from '@/domains/admin-stats/queries'

export async function GET(request: Request) {
  // #1146: revenue is finance/ops-only. Catalog/support admins must
  // NOT see the daily revenue series — separation of duties.
  const session = await getActionSession()
  if (!session || !isFinanceAdminRole(session.user.role)) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const daysParam = searchParams.get('days')
  const days = daysParam ? Number.parseInt(daysParam, 10) : 30
  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json({ message: 'Parámetro days inválido' }, { status: 400 })
  }

  try {
    const series = await getAdminDailyRevenue(days)
    return NextResponse.json({ days, series })
  } catch (err) {
    logger.error('admin.api.revenue.get_failed', { error: err })
    return NextResponse.json({ message: 'Error interno' }, { status: 500 })
  }
}
