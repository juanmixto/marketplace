import { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { RequestForm } from './RequestForm'

export const metadata: Metadata = {
  title: 'Recuperar Contraseña | Raíz Directa',
  description: 'Recupera acceso a tu cuenta introduciendo tu email registrado.',
}

export default async function RecuperarContrasena() {
  // Redirect if already logged in
  const session = await auth()
  if (session) {
    redirect('/')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8 dark:bg-[var(--background)]">
      <div className="w-full max-w-md">
        <div className="rounded-lg bg-white p-8 shadow dark:bg-[var(--surface)] dark:shadow-black/30">
          <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-[var(--foreground)]">
            Recuperar contraseña
          </h1>
          <p className="mb-8 text-gray-600 dark:text-[var(--muted)]">
            Introduce tu email y te enviaremos un enlace para recuperar tu contraseña.
          </p>

          <RequestForm />

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
