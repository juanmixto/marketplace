import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { UserRole, type UserRole as UserRoleValue } from '@/generated/prisma/enums'
import { isAdmin, hasRole } from '@/lib/roles'

export async function requireAuth() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return session
}

export async function requireRole(allowed: readonly UserRoleValue[]) {
  const session = await requireAuth()
  if (!hasRole(session.user.role, allowed)) {
    throw new Error(`Acceso denegado. Rol requerido: ${allowed.join(', ')}`)
  }
  return session
}

export async function requireAdmin() {
  const session = await requireAuth()
  if (!isAdmin(session.user.role)) redirect('/')
  return session
}

export async function requireVendor() {
  return requireRole([UserRole.VENDOR])
}
