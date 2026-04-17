'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import {
  identifyPostHog,
  initPostHog,
  isPostHogEnabled,
  resetPostHog,
} from '@/lib/posthog'

/**
 * Client-only PostHog bootstrap. Initializes the SDK once on mount and
 * keeps the identified user in sync with the NextAuth session.
 */
export function PostHogProvider() {
  const { data: session, status } = useSession()
  const lastIdentifiedRef = useRef<string | null>(null)

  useEffect(() => {
    initPostHog()
  }, [])

  useEffect(() => {
    if (!isPostHogEnabled()) return
    if (status === 'loading') return

    const userId = session?.user?.id ?? null

    if (userId) {
      if (lastIdentifiedRef.current === userId) return
      identifyPostHog(userId, {
        email: session?.user?.email ?? undefined,
        role: session?.user?.role ?? undefined,
      })
      lastIdentifiedRef.current = userId
      return
    }

    // Session went from authenticated → unauthenticated: reset PostHog so
    // subsequent events are attributed to an anonymous visitor.
    if (lastIdentifiedRef.current) {
      resetPostHog()
      lastIdentifiedRef.current = null
    }
  }, [session, status])

  return null
}
