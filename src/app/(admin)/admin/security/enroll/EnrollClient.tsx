'use client'

import { useEffect, useState } from 'react'

interface EnrollPayload {
  qrDataUrl: string
  otpauthUrl: string
}

export function EnrollClient() {
  const [payload, setPayload] = useState<EnrollPayload | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  // Kick off enrollment on mount. POST (not GET) because it mutates
  // server state — creates / rotates the stored secret.
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/2fa/enroll', { method: 'POST' })
      .then(async r => {
        if (!r.ok) throw new Error('enroll_failed')
        return (await r.json()) as EnrollPayload
      })
      .then(data => {
        if (!cancelled) setPayload(data)
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo iniciar la configuración.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) {
        setError('Código incorrecto. Inténtalo de nuevo.')
        return
      }
      // Force a fresh JWT that carries has2fa: true so the proxy
      // lifts the enrollment gate. signout redirects through the
      // login page; the admin logs back in with TOTP from now on.
      window.location.href = '/api/auth/signout?callbackUrl=/login'
    } catch {
      setError('Error al verificar el código.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Generando clave…
      </p>
    )
  }

  if (error && !payload) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-300">
        {error}
      </p>
    )
  }

  if (!payload) return null

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <p className="text-sm font-medium mb-3">1. Escanea este código</p>
        {/* next/image cannot optimise a data: URL, so a plain <img>
            is the right shape here. Dimensions are fixed at 220 px in
            the server-side QRCode generation to keep CLS off. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={payload.qrDataUrl}
          alt="Código QR para configurar TOTP"
          width={220}
          height={220}
          className="mx-auto"
        />
        <details className="mt-4 text-xs text-gray-600 dark:text-gray-400">
          <summary className="cursor-pointer">
            ¿No puedes escanear? Copia el enlace manualmente
          </summary>
          <code className="mt-2 block break-all rounded bg-gray-100 p-2 text-xs dark:bg-gray-800">
            {payload.otpauthUrl}
          </code>
        </details>
      </div>

      <form onSubmit={handleVerify} className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium">
            2. Introduce el código que muestra tu app
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6,10}"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-widest dark:border-gray-700 dark:bg-gray-900"
            placeholder="000000"
            autoFocus
            required
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || code.length < 6}
          className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? 'Verificando…' : 'Activar 2FA'}
        </button>
      </form>
    </div>
  )
}
