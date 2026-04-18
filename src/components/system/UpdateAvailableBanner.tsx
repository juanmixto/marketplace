'use client'

import { useEffect, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 60_000

/**
 * Captures the build SHA the page loaded with, then polls /api/version
 * once a minute. If the server starts reporting a different SHA (i.e. a
 * deploy landed), shows a banner letting the user reload.
 *
 * Renders nothing when:
 *   - The current SHA is "unknown"/"dev" (no useful comparison possible)
 *   - The fetch fails (server may be momentarily down — silent retry)
 *   - The server SHA matches the loaded SHA (the common case)
 *
 * The banner sticks until the user reloads or dismisses it. After
 * dismissal the polling continues but the banner stays hidden until the
 * SHA changes again.
 */
export function UpdateAvailableBanner() {
  const loadedSha = process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'unknown'
  const [serverSha, setServerSha] = useState<string | null>(null)
  const [dismissedSha, setDismissedSha] = useState<string | null>(null)
  const lastSeenRef = useRef<string | null>(null)

  useEffect(() => {
    if (loadedSha === 'unknown' || loadedSha === 'dev') return
    let cancelled = false

    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { sha?: string }
        if (cancelled || !data.sha) return
        if (data.sha !== lastSeenRef.current) {
          lastSeenRef.current = data.sha
          setServerSha(data.sha)
        }
      } catch {
        // network blip — try again next tick
      }
    }

    void check()
    const id = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [loadedSha])

  const updateAvailable = serverSha !== null && serverSha !== loadedSha && serverSha !== dismissedSha

  if (!updateAvailable) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between gap-3 border-b border-emerald-300 bg-emerald-50/95 px-4 py-2 text-sm text-emerald-900 shadow-sm backdrop-blur-sm dark:border-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-100"
    >
      <p className="flex-1 text-center sm:text-left">
        Nueva versión disponible. Recarga para ver los últimos cambios.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700"
        >
          Recargar
        </button>
        <button
          type="button"
          onClick={() => setDismissedSha(serverSha)}
          aria-label="Descartar aviso"
          className="rounded-md px-2 py-1 text-xs text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
