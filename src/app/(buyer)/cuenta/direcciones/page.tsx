import { Metadata } from 'next'
import { requireAuth } from '@/lib/auth-guard'
import { DireccionesClient } from './DireccionesClient'

export const metadata: Metadata = {
  title: 'Mis Direcciones | Mercado Productor',
  description: 'Gestiona tus direcciones de envío',
}

export default async function Direcciones() {
  await requireAuth()

  return (
    <main className="space-y-6 max-w-3xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Mis direcciones</h1>
        <p className="mt-2 text-[var(--muted)]">
          Gestiona tus direcciones de envío
        </p>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <DireccionesClient />
      </div>
    </main>
  )
}
