import { Metadata } from 'next'
import Link from 'next/link'
import { FaceFrownIcon } from '@heroicons/react/24/outline'

export const metadata: Metadata = {
  title: '404 - Página no encontrada | Mercado Productor',
  description: 'La página que buscas no existe o ha sido movida.',
}

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-white to-emerald-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center">
        {/* Icono */}
        <div className="mb-6 flex justify-center">
          <FaceFrownIcon className="h-24 w-24 text-emerald-600" />
        </div>

        {/* Número 404 */}
        <h1 className="mb-2 text-8xl font-bold text-emerald-600">404</h1>

        {/* Título */}
        <h2 className="mb-4 text-3xl font-semibold text-gray-900">Página no encontrada</h2>

        {/* Descripción */}
        <p className="mb-8 max-w-md text-lg text-gray-600">
          Lo sentimos, la página que buscas no existe o ha sido movida. Pero encontrarás lo que
          necesitas en nuestro catálogo o en el inicio.
        </p>

        {/* CTAs */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="rounded-lg bg-emerald-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Volver al inicio
          </Link>
          <Link
            href="/productos"
            className="rounded-lg border-2 border-emerald-600 px-8 py-3 font-semibold text-emerald-600 transition-colors hover:bg-emerald-50"
          >
            Ver productos
          </Link>
        </div>
      </div>
    </main>
  )
}
