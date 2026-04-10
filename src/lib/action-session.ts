import { auth } from '@/lib/auth'
import type { UserRole } from '@/generated/prisma/enums'

export interface ActionSession {
  user: {
    id: string
    role: UserRole
    email?: string | null
    name?: string | null
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __testActionSession: ActionSession | null | undefined
}

export async function getActionSession(): Promise<ActionSession | null> {
  if (process.env.NODE_ENV === 'test' && globalThis.__testActionSession !== undefined) {
    return globalThis.__testActionSession
  }

  const session = await auth()
  if (!session) return null

  return {
    user: {
      id: session.user.id,
      role: session.user.role,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
    },
  }
}

export function setTestActionSession(session: ActionSession | null) {
  globalThis.__testActionSession = session
}

export function resetTestActionSession() {
  globalThis.__testActionSession = undefined
}
