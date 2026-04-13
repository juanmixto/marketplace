'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  params: Promise<{ token: string }>
}

export default function ResetPasswordPage({ params }: Props) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState({ password: '', passwordConfirm: '' })

  // Unwrap promise for token (this is in a client component)
  useState(() => {
    params.then(p => setToken(p.token))
  })

  if (!token) {
    return <div className="text-center mt-8">Cargando...</div>
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: formData.password,
          passwordConfirm: formData.passwordConfirm,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al resetear la contraseña')
        return
      }

      setSuccess(true)
      setTimeout(() => router.push('/login'), 2000)
    } catch (err) {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800/60 dark:bg-emerald-950/40">
          <p className="text-emerald-800 font-semibold dark:text-emerald-300">✓ Contraseña actualizada correctamente</p>
          <p className="text-sm text-emerald-700 mt-2 dark:text-emerald-400">Redirigiendo al login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">Nueva contraseña</h1>

        {error && (
          <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Nueva contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div>
            <label htmlFor="passwordConfirm" className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Confirmar contraseña
            </label>
            <input
              id="passwordConfirm"
              type="password"
              required
              minLength={8}
              value={formData.passwordConfirm}
              onChange={e => setFormData({...formData, passwordConfirm: e.target.value})}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Repite tu contraseña"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500/50 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:disabled:bg-slate-700"
          >
            {loading ? 'Actualizando...' : 'Establecer nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
