import { NextResponse } from 'next/server'
import { getActionSession } from '@/lib/action-session'
import { isAdminRole } from '@/lib/roles'
import { logger } from '@/lib/logger'
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
    logger.error('admin.api.stats.get_failed', { error: err })
    return NextResponse.json({ message: 'Error interno' }, { status: 500 })
  }
}
