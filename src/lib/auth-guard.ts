import { redirect } from 'next/navigation'
import type { Session } from 'next-auth'
import { auth } from '@/lib/auth'
import { UserRole, type UserRole as UserRoleValue } from '@/generated/prisma/enums'
import { isAdmin, hasRole, CATALOG_ADMIN_ROLES, SUPERADMIN_ROLES } from '@/lib/roles'

export async function requireAuth(): Promise<Session> {
  // Test-mode shortcut: honor the action-session global the same way
  // getActionSession does. Keeps admin actions (which call
  // requireAdmin/requireAuth) exercisable from integration tests without
  // going through NextAuth, which has no request context in Node.
  if (process.env.NODE_ENV === 'test' && typeof globalThis.__testActionSession !== 'undefined') {
    const testSession = globalThis.__testActionSession
    if (!testSession) throw new Error('requireAuth: unauthenticated (no test session set)')
    return testSession as unknown as Session
  }
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

export async function requireSuperadmin() {
  const session = await requireAuth()
  if (!hasRole(session.user.role, SUPERADMIN_ROLES)) redirect('/')
  return session
}

export async function requireCatalogAdmin() {
  const session = await requireAuth()
  if (!hasRole(session.user.role, CATALOG_ADMIN_ROLES)) redirect('/')
  return session
}
