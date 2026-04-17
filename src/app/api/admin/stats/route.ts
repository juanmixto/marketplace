import { NextResponse } from 'next/server'
import { getActionSession } from '@/lib/action-session'
import { isAdminRole } from '@/lib/roles'
import { getAdminStats } from '@/domains/admin-stats/queries'

export async function GET() {
  const session = await getActionSession()
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 })
  }

  try {
    const stats = await getAdminStats()
    return NextResponse.json(stats)
  } catch (err) {
    console.error('[GET /api/admin/stats]', err)
    return NextResponse.json({ message: 'Error interno' }, { status: 500 })
  }
}
