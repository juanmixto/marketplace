'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)
    setLoading(true)

    const data = new FormData(e.currentTarget)
    const body = {
      firstName: data.get('firstName'),
      lastName: data.get('lastName'),
      email: data.get('email'),
      password: data.get('password'),
    }

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json()
      setError(err.message || 'Error al crear la cuenta')
      setLoading(false)
      return
    }

    const result = await res.json()
    setSuccessMessage(result.message || 'Cuenta creada. Revisa tu email para verificar tu cuenta.')
    setLoading(false)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--foreground)]">Crear cuenta</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Es gratis. Sin compromisos.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input name="firstName" autoComplete="given-name" label="Nombre" placeholder="María" required />
          <Input name="lastName" autoComplete="family-name" label="Apellidos" placeholder="García" required />
        </div>
        <Input name="email" type="email" autoComplete="email" label="Email" placeholder="tu@email.com" required />
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          label="Contraseña"
          placeholder="Mínimo 8 caracteres"
          minLength={8}
          required
        />

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
            {error}
          </p>
        )}

        {successMessage && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200">
            {successMessage}{' '}
            <Link href="/login" className="font-semibold underline underline-offset-2">
              Ir a iniciar sesión
            </Link>
          </p>
        )}

        <Button type="submit" className="w-full" isLoading={loading} size="lg">
          Crear cuenta
        </Button>

        <p className="text-center text-xs text-[var(--muted)]">
          Al registrarte aceptas los{' '}
          <Link href="/terminos" className="rounded-sm text-emerald-600 hover:underline dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30">Términos de uso</Link>
          {' '}y la{' '}
          <Link href="/privacidad" className="rounded-sm text-emerald-600 hover:underline dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30">Política de privacidad</Link>
        </p>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
          Inicia sesión
        </Link>
      </p>
    </div>
  )
}
