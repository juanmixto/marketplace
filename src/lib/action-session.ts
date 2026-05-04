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
  var __testActionSession: ActionSession | null | undefined
}

export async function getActionSession(): Promise<ActionSession | null> {
  if (process.env.NODE_ENV === 'test' && globalThis.__testActionSession !== undefined) {
    return globalThis.__testActionSession
  }

  const session = await auth()
  // #1142: a JWT whose tokenVersion no longer matches the User row (or
  // that points at an anonimized / suspended user) survives `auth()`
  // structurally because we strip the identity claims rather than
  // returning null from the callback. Treat empty id as "no session"
  // so requireAuth / domain actions reject it.
  if (!session?.user?.id) return null

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
