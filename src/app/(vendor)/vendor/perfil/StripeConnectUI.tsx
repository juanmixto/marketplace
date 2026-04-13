'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  createStripeConnectLink,
  verifyStripeOnboarding,
} from '@/domains/vendors/stripe'
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { useT } from '@/i18n'

interface StripeConnectProps {
  onboarded: boolean
}

export function StripeConnectUI({ onboarded }: StripeConnectProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [localOnboarded, setLocalOnboarded] = useState(onboarded)

  useEffect(() => {
    const stripe = searchParams.get('stripe')
    if (stripe === 'success') {
      setMessage({
        type: 'success',
        text: t('vendor.stripe.verifying'),
      })
      verifyStripeOnboarding().then(verified => {
        if (verified) {
          setLocalOnboarded(true)
          setMessage({
            type: 'success',
            text: t('vendor.stripe.verified'),
          })
          setTimeout(() => router.replace('/vendor/perfil'), 2000)
        } else {
          setMessage({
            type: 'error',
            text: t('vendor.stripe.verifyInProgress'),
          })
        }
      })
    } else if (stripe === 'refresh') {
      setMessage({
        type: 'error',
        text: t('vendor.stripe.refreshNeeded'),
      })
    }
  }, [searchParams, router, t])

  const handleConnect = async () => {
    setLoading(true)
    setMessage(null)

    try {
      const url = await createStripeConnectLink()
      window.location.href = url
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : t('vendor.stripe.connectError'),
      })
      setLoading(false)
    }
  }

  if (localOnboarded) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-emerald-900/40 dark:bg-emerald-950/30">
        <div className="flex items-start gap-3">
          <CheckCircleIcon className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5 dark:text-emerald-400" />
          <div>
            <h3 className="font-semibold text-green-900 dark:text-emerald-200">{t('vendor.stripe.configured')}</h3>
            <p className="mt-1 text-sm text-green-800 dark:text-emerald-300">
              {t('vendor.stripe.configuredDesc')}
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
              ? 'border border-green-200 bg-green-50 text-green-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-start gap-3 mb-4">
          <ExclamationCircleIcon className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5 dark:text-amber-400" />
          <div>
            <h3 className="font-semibold text-[var(--foreground)]">{t('vendor.stripe.configureTitle')}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t('vendor.stripe.configureDesc')}
            </p>
          </div>
        </div>

        <button
          onClick={handleConnect}
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400"
        >
          {loading ? t('vendor.stripe.connecting') : t('vendor.stripe.connect')}
        </button>

        <p className="mt-3 text-xs text-[var(--muted-light)]">
          {t('vendor.stripe.redirectNote')}
        </p>
      </div>
    </div>
  )
}
