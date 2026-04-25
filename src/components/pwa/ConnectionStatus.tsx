'use client'

// User-visible banner that surfaces 3 connection states:
//   1. Offline — persistent until back online.
//   2. Slow connection (effectiveType 2g/slow-2g) — auto-dismiss 5s.
//   3. Save-Data enabled — auto-dismiss 5s.
//
// Also drives the connection_* PostHog events (#793) so we have data
// on how often each state actually fires for real users.
//
// Implementation notes:
// - Banner is sticky-top with z-index above the header but below modals.
// - Respects `env(safe-area-inset-top)` so it doesn't sit under the iOS notch.
// - Defensive against Safari (no NetworkInformation API) — only shows the
//   offline banner there.

import { useEffect, useState } from 'react'
import { subscribeConnection, type EffectiveType } from '@/lib/connection'
import {
  trackConnectionOffline,
  trackConnectionRestored,
  trackConnectionSlowDetected,
} from '@/lib/analytics/network-events'

type BannerKind = 'offline' | 'slow' | 'savedata' | null

const AUTO_DISMISS_MS = 5_000

export function ConnectionStatus(): React.ReactElement | null {
  const [kind, setKind] = useState<BannerKind>(null)
  // Track previous state so we can fire `connection_restored` only on
  // the actual offline → online transition, not on every change tick.
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    let dismissTimer: ReturnType<typeof setTimeout> | undefined

    const unsubscribe = subscribeConnection(({ effectiveType, saveData, online }) => {
      if (dismissTimer) clearTimeout(dismissTimer)

      if (!online) {
        setKind('offline')
        if (!wasOffline) {
          trackConnectionOffline()
          setWasOffline(true)
        }
        return
      }

      if (wasOffline) {
        trackConnectionRestored({ effectiveType: effectiveType as EffectiveType | undefined })
        setWasOffline(false)
      }

      if (saveData) {
        setKind('savedata')
        trackConnectionSlowDetected({ effectiveType: effectiveType as EffectiveType | undefined, saveData: true })
        dismissTimer = setTimeout(() => setKind(null), AUTO_DISMISS_MS)
        return
      }

      if (effectiveType === '2g' || effectiveType === 'slow-2g') {
        setKind('slow')
        trackConnectionSlowDetected({ effectiveType: effectiveType as EffectiveType, saveData: false })
        dismissTimer = setTimeout(() => setKind(null), AUTO_DISMISS_MS)
        return
      }

      setKind(null)
    })

    return () => {
      unsubscribe()
      if (dismissTimer) clearTimeout(dismissTimer)
    }
  }, [wasOffline])

  if (kind === null) return null

  const label =
    kind === 'offline'
      ? 'Estás sin conexión. Algunas acciones se sincronizarán al volver.'
      : kind === 'slow'
        ? 'Conexión lenta. Algunas funciones pueden tardar.'
        : 'Modo ahorro de datos activo. Mostramos imágenes en menor calidad.'

  const tone =
    kind === 'offline'
      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
      : 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200'

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-30 w-full px-4 py-2 text-sm font-medium ${tone}`}
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      {label}
    </div>
  )
}
