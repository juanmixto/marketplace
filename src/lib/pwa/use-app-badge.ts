'use client'

import { useEffect } from 'react'

type BadgeFn = (count?: number) => Promise<void>

/**
 * Applies a numeric badge to the installed app icon via the Badging API.
 * Silent no-op on platforms that don't support it (Safari iOS, Firefox,
 * Chrome on Linux, server). Clears the badge on unmount so stale numbers
 * don't linger after the user signs out or navigates away from the
 * dashboard that owns the count.
 */
export function useAppBadge(count: number | undefined) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const nav = navigator as unknown as {
      setAppBadge?: BadgeFn
      clearAppBadge?: () => Promise<void>
    }
    if (typeof nav.setAppBadge !== 'function') return

    const apply = async () => {
      try {
        if (!count || count <= 0) {
          await nav.clearAppBadge?.()
        } else {
          await nav.setAppBadge?.(count)
        }
      } catch {
        // Badging API rejects on some OS permission states — we treat
        // every failure as "not supported right now" and move on.
      }
    }

    void apply()

    return () => {
      try {
        void nav.clearAppBadge?.()
      } catch {
        // ignore
      }
    }
  }, [count])
}
