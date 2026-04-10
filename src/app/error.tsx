'use client'

import { useEffect } from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global error caught:', error.message, error.digest)
  }, [error])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-white to-red-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center">
        {/* Icono */}
        <div className="mb-6 flex justify-center">
          <ExclamationTriangleIcon className="h-24 w-24 text-red-600" />
        </div>

        {/* Número de error */}
        <h1 className="mb-2 text-8xl font-bold text-red-600">500</h1>

        {/* Título */}
        <h2 className="mb-4 text-3xl font-semibold text-gray-900">Algo ha salido mal</h2>

        {/* Descripción */}
        <p className="mb-8 max-w-md text-lg text-gray-600">
          Ha ocurrido un error inesperado. Nuestro equipo ha sido notificado. Por favor, inténtalo
          de nuevo.
        </p>

        {/* Error digest para debugging */}
        {error.digest && (
          <p className="mb-6 rounded-lg bg-gray-100 px-4 py-2 font-mono text-sm text-gray-700">
            Error ID: {error.digest}
          </p>
        )}

        {/* Botones */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-emerald-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Intentar de nuevo
          </button>
          <a
            href="/"
            className="rounded-lg border-2 border-emerald-600 px-8 py-3 font-semibold text-emerald-600 transition-colors hover:bg-emerald-50"
          >
            Volver al inicio
          </a>
        </div>
      </div>
    </main>
  )
}
