import { NextResponse } from 'next/server'
import { getActionSession } from '@/lib/action-session'
import { isAdminRole } from '@/lib/roles'
import { getAdminDailyRevenue } from '@/domains/admin-stats/queries'

export async function GET(request: Request) {
  const session = await getActionSession()
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 })
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
    console.error('[GET /api/admin/revenue]', err)
    return NextResponse.json({ message: 'Error interno' }, { status: 500 })
  }
}
