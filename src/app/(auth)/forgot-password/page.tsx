import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Recuperar contraseña',
}

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">Recuperar contraseña</h1>
        <p className="text-sm text-[var(--muted)] mb-6">
          Introduce tu email y te enviaremos un enlace para resetear tu contraseña.
        </p>

        <form action="/api/auth/forgot-password" method="POST" className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="tu@email.com"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            Enviar instrucciones
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-[var(--muted)]">
          ¿Recuerdas tu contraseña?{' '}
          <a href="/login" className="font-semibold text-emerald-600 hover:text-emerald-700">
            Volver a login
          </a>
        </div>
      </div>
    </div>
  )
}
