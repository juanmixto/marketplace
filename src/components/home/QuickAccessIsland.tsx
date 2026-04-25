'use client'

import { useSession } from 'next-auth/react'

/**
 * Hides the logged-out "Entra según tu perfil" block once the user is
 * authenticated. Server-renders the block with its children so anonymous
 * visitors get a fully static home hero; the client only erases the
 * subtree after session resolves.
 */
export function QuickAccessIsland({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const hide = status === 'authenticated' && !!session?.user
  if (hide) return null
  return <>{children}</>
}
