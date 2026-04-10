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
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Mis direcciones</h1>
        <p className="mt-2 text-gray-600">
          Gestiona tus direcciones de envío
        </p>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <DireccionesClient />
      </div>
    </main>
  )
}
