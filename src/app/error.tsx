'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  const [sentryEventId, setSentryEventId] = useState<string | null>(null)
  const [correlationId, setCorrelationId] = useState<string | null>(null)

  useEffect(() => {
    // Read the correlation id the root layout injected as a meta tag so
    // the user can cite it to support; this id matches the one in the
    // request's `x-correlation-id` response header and in the structured
    // logs for the same request (see #1210).
    if (typeof document !== 'undefined') {
      const meta = document.querySelector('meta[name="x-correlation-id"]')
      const id = meta?.getAttribute('content')
      if (id) setCorrelationId(id)
    }
  }, [])

  useEffect(() => {
    // Fire-and-forget: send to Sentry and capture the event id so we can
    // show it to the user. Support can search Sentry by this id to find
    // the full stack + correlationId + user context. Safe to run even
    // when Sentry is not configured — the import fails silently.
    ;(async () => {
      try {
        const Sentry = await import('@sentry/nextjs')
        const id = Sentry.captureException(error, {
          tags: { 'error.digest': error.digest ?? 'unknown' },
        })
        if (id) setSentryEventId(id)
      } catch {
        // Sentry not configured — the digest is still shown below.
      }
    })()
  }, [error])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-white to-red-50 px-4 py-12 sm:px-6 lg:px-8 dark:from-[var(--background)] dark:to-red-950/30">
      <div className="text-center">
        {/* Icono */}
        <div className="mb-6 flex justify-center">
          <ExclamationTriangleIcon className="h-24 w-24 text-red-600 dark:text-red-400" />
        </div>

        {/* Número de error */}
        <h1 className="mb-2 text-8xl font-bold text-red-600 dark:text-red-400">500</h1>

        {/* Título */}
        <h2 className="mb-4 text-3xl font-semibold text-gray-900 dark:text-[var(--foreground)]">Algo ha salido mal</h2>

        {/* Descripción */}
        <p className="mb-8 max-w-md text-lg text-gray-600 dark:text-[var(--muted)]">
          Ha ocurrido un error inesperado. Nuestro equipo ha sido notificado. Por favor, inténtalo
          de nuevo.
        </p>

        {/* Error digest para debugging. Muestra el Sentry event id cuando
            Sentry está configurado — así el usuario puede citarlo a
            soporte y el equipo lo encuentra en un click. */}
        {(error.digest || sentryEventId || correlationId) && (
          <div className="mb-6 space-y-1 rounded-lg bg-gray-100 px-4 py-2 font-mono text-xs text-gray-700 dark:bg-[var(--surface-raised)] dark:text-[var(--foreground-soft)]">
            {error.digest && <p>Error ID: {error.digest}</p>}
            {sentryEventId && <p>Trace: {sentryEventId}</p>}
            {correlationId && <p>Request ID: {correlationId}</p>}
          </div>
        )}

        {/* Botones */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-emerald-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
          >
            Intentar de nuevo
          </button>
          <Link
            href="/"
            className="rounded-lg border-2 border-emerald-600 px-8 py-3 font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  )
}
