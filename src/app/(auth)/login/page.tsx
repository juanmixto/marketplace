'use client'

import { useActionState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const data = new FormData(e.currentTarget)
    const result = await signIn('credentials', {
      email: data.get('email') as string,
      password: data.get('password') as string,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('Email o contraseña incorrectos')
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Bienvenido</h1>
      <p className="mt-1 text-sm text-gray-500">Inicia sesión en tu cuenta</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input
          name="email"
          type="email"
          label="Email"
          placeholder="tu@email.com"
          autoComplete="email"
          required
        />
        <div className="relative">
          <Input
            name="password"
            type={showPass ? 'text' : 'password'}
            label="Contraseña"
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPass(v => !v)}
            className="absolute right-3 top-8 text-gray-400 hover:text-gray-600"
          >
            {showPass ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
        )}

        <Button type="submit" className="w-full" isLoading={loading} size="lg">
          Iniciar sesión
        </Button>
      </form>

      <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
        <p className="text-xs font-medium text-gray-500 mb-1">Credenciales de prueba:</p>
        <div className="text-xs text-gray-600 space-y-0.5">
          <p>Admin: <code>admin@marketplace.com</code> / <code>admin1234</code></p>
          <p>Productor: <code>productor@test.com</code> / <code>vendor1234</code></p>
          <p>Cliente: <code>cliente@test.com</code> / <code>cliente1234</code></p>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-gray-500">
        ¿No tienes cuenta?{' '}
        <Link href="/register" className="font-semibold text-emerald-600 hover:underline">
          Regístrate gratis
        </Link>
      </p>
    </div>
  )
}
