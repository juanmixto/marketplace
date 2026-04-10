'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { signIn } from 'next-auth/react'

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
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

    // Auto-login after register
    await signIn('credentials', {
      email: body.email as string,
      password: body.password as string,
      redirect: false,
    })

    router.push('/')
    router.refresh()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--foreground)]">Crear cuenta</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Es gratis. Sin compromisos.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input name="firstName" label="Nombre" placeholder="María" required />
          <Input name="lastName" label="Apellidos" placeholder="García" required />
        </div>
        <Input name="email" type="email" label="Email" placeholder="tu@email.com" required />
        <Input
          name="password"
          type="password"
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

        <Button type="submit" className="w-full" isLoading={loading} size="lg">
          Crear cuenta
        </Button>

        <p className="text-center text-xs text-[var(--muted)]">
          Al registrarte aceptas los{' '}
          <Link href="#" className="rounded-sm text-emerald-600 hover:underline dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30">Términos de uso</Link>
          {' '}y la{' '}
          <Link href="#" className="rounded-sm text-emerald-600 hover:underline dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30">Política de privacidad</Link>
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
