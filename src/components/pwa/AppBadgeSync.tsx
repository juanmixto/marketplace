'use client'

import { useAppBadge } from '@/lib/pwa/use-app-badge'

interface AppBadgeSyncProps {
  count: number | undefined
}

/**
 * Server-friendly wrapper that lets a server component hand a count to
 * the client-only `useAppBadge` hook without marking the whole layout as
 * client. Renders nothing.
 */
export default function AppBadgeSync({ count }: AppBadgeSyncProps) {
  useAppBadge(count)
  return null
}
