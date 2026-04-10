'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  createStripeConnectLink,
  verifyStripeOnboarding,
} from '@/domains/vendors/stripe'
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'

interface StripeConnectProps {
  onboarded: boolean
}

export function StripeConnectUI({ onboarded }: StripeConnectProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [localOnboarded, setLocalOnboarded] = useState(onboarded)

  // Verificar si volvemos de Stripe
  useEffect(() => {
    const stripe = searchParams.get('stripe')
    if (stripe === 'success') {
      setMessage({
        type: 'success',
        text: 'Verificando configuración de pagos...',
      })
      verifyStripeOnboarding().then(verified => {
        if (verified) {
          setLocalOnboarded(true)
          setMessage({
            type: 'success',
            text: '✓ Cuenta bancaria configurada correctamente',
          })
          setTimeout(() => router.replace('/vendor/perfil'), 2000)
        } else {
          setMessage({
            type: 'error',
            text: 'La verificación aún está en proceso. Intenta de nuevo en unos minutos.',
          })
        }
      })
    } else if (stripe === 'refresh') {
      setMessage({
        type: 'error',
        text: 'Necesitamos que completes el proceso. Intenta de nuevo.',
      })
    }
  }, [searchParams, router])

  const handleConnect = async () => {
    setLoading(true)
    setMessage(null)

    try {
      const url = await createStripeConnectLink()
      window.location.href = url
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Error al conectar Stripe',
      })
      setLoading(false)
    }
  }

  if (localOnboarded) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6">
        <div className="flex items-start gap-3">
          <CheckCircleIcon className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-green-900">Pagos configurados</h3>
            <p className="mt-1 text-sm text-green-800">
              Tu cuenta de Stripe está conectada. Recibirás liquidaciones semanales en tu cuenta
              bancaria.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`rounded-lg p-4 ${
            message.type === 'success'
              ? 'border border-green-200 bg-green-50 text-green-800'
              : 'border border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-start gap-3 mb-4">
          <ExclamationCircleIcon className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-gray-900">Configurar pagos</h3>
            <p className="mt-1 text-sm text-gray-600">
              Conecta tu cuenta bancaria para recibir pagos. Usamos Stripe para gestionar los
              pagos de forma segura.
            </p>
          </div>
        </div>

        <button
          onClick={handleConnect}
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Conectando...' : 'Conectar con Stripe'}
        </button>

        <p className="mt-3 text-xs text-gray-500">
          Serás redirigido al formulario seguro de Stripe para completar tu información bancaria.
        </p>
      </div>
    </div>
  )
}
