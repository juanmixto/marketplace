'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/i18n'

/**
 * Renders a small fixed banner at the top of the viewport when the device
 * is offline. Automatically hides when connectivity returns. Does not
 * render anything on the server or when online.
 */
export default function OfflineIndicator() {
  const t = useT()
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)

    // Initial state.
    setOffline(!navigator.onLine)

    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-x-0 top-0 z-[70] bg-amber-600 px-4 py-1.5 text-center text-xs font-medium text-white shadow-sm"
    >
      {t('pwa.offline.banner')}
    </div>
  )
}
