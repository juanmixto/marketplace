import { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ResetForm } from './ResetForm'

export const metadata: Metadata = {
  title: 'Establecer Nueva Contraseña | Mercado Productor',
  description: 'Establece una nueva contraseña para tu cuenta.',
}

interface NuevaPageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function Nueva({ searchParams }: NuevaPageProps) {
  // Redirect if already logged in
  const session = await auth()
  if (session) {
    redirect('/')
  }

  const params = await searchParams
  const token = params.token

  // Validate token exists
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8 dark:bg-[var(--background)]">
        <div className="w-full max-w-md">
          <div className="rounded-lg bg-white p-8 shadow dark:bg-[var(--surface)] dark:shadow-black/30">
            <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-[var(--foreground)]">
              Enlace inválido
            </h1>
            <p className="mb-6 text-gray-600 dark:text-[var(--muted)]">
              El enlace de recuperación no es válido. Por favor, solicita uno nuevo.
            </p>
            <Link
              href="/forgot-password"
              className="inline-block rounded-lg bg-emerald-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            >
              Solicitar nuevo enlace
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8 dark:bg-[var(--background)]">
      <div className="w-full max-w-md">
        <div className="rounded-lg bg-white p-8 shadow dark:bg-[var(--surface)] dark:shadow-black/30">
          <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-[var(--foreground)]">
            Establecer nueva contraseña
          </h1>
          <p className="mb-8 text-gray-600 dark:text-[var(--muted)]">
            Introduce tu nueva contraseña. Debe tener al menos 8 caracteres.
          </p>

          <ResetForm token={token} />

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-[var(--muted)]">
              ¿Recuerdas tu contraseña?{' '}
              <Link href="/login" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
