'use client'

import { useEffect, useState } from 'react'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

// global-error.tsx captures errors from the root layout itself, where
// error.tsx cannot reach. It must render its own <html>/<body> and avoid
// depending on globals.css since a CSS load failure may be the very
// reason this boundary triggered. Styles are inline.
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const [sentryEventId, setSentryEventId] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const Sentry = await import('@sentry/nextjs')
        const id = Sentry.captureException(error, {
          tags: { 'error.digest': error.digest ?? 'unknown', 'error.boundary': 'global' },
        })
        if (id) setSentryEventId(id)
      } catch {
        // Sentry not configured — the digest is still shown below.
      }
    })()
  }, [error])

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
          background: '#fff',
          color: '#111827',
        }}
      >
        <main style={{ maxWidth: '32rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '4rem', fontWeight: 700, margin: 0, color: '#dc2626' }}>500</h1>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0.5rem 0 1rem' }}>
            Algo ha salido mal
          </h2>
          <p style={{ fontSize: '1rem', lineHeight: 1.5, color: '#4b5563', margin: '0 0 1.5rem' }}>
            Ha ocurrido un error inesperado. Nuestro equipo ha sido notificado. Por favor, inténtalo
            de nuevo.
          </p>
          {(error.digest || sentryEventId) && (
            <div
              style={{
                marginBottom: '1.5rem',
                padding: '0.5rem 1rem',
                background: '#f3f4f6',
                borderRadius: '0.5rem',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.75rem',
                color: '#374151',
              }}
            >
              {error.digest && <p style={{ margin: 0 }}>Error ID: {error.digest}</p>}
              {sentryEventId && <p style={{ margin: 0 }}>Trace: {sentryEventId}</p>}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={reset}
              style={{
                minHeight: '44px',
                padding: '0.75rem 2rem',
                background: '#059669',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              Intentar de nuevo
            </button>
            <a
              href="/"
              style={{
                minHeight: '44px',
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.75rem 2rem',
                background: '#fff',
                color: '#059669',
                border: '2px solid #059669',
                borderRadius: '0.5rem',
                fontWeight: 600,
                fontSize: '1rem',
                textDecoration: 'none',
              }}
            >
              Volver al inicio
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
