'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { advanceFulfillment } from '@/domains/vendors/actions'
import {
  prepareFulfillment,
  markFulfillmentIncident,
} from '@/domains/shipping/actions'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'

const LEGACY_NEXT_ACTION_KEY: Record<string, TranslationKeys> = {
  PENDING: 'vendor.fulfillment.confirm',
}

interface Props {
  fulfillmentId: string
  status: string
  labelUrl?: string | null
  trackingUrl?: string | null
}

export function FulfillmentActions({ fulfillmentId, status, labelUrl, trackingUrl }: Props) {
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLegacyAdvance() {
    setLoading(true)
    setError(null)
    try {
      await advanceFulfillment(fulfillmentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('vendor.fulfillment.updateError'))
    } finally {
      setLoading(false)
    }
  }

  async function handlePrepare() {
    setLoading(true)
    setError(null)
    try {
      const result = await prepareFulfillment(fulfillmentId)
      if (!result.ok) {
        if (result.code === 'VENDOR_ADDRESS_MISSING') {
          setError(t('vendor.fulfillment.addressMissing'))
        } else {
          setError(result.message || t('vendor.fulfillment.labelFailed'))
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('vendor.fulfillment.labelFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleIncident() {
    setLoading(true)
    setError(null)
    try {
      await markFulfillmentIncident(fulfillmentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('vendor.fulfillment.updateError'))
    } finally {
      setLoading(false)
    }
  }

  // Legacy PENDING → CONFIRMED button, untouched.
  if (status === 'PENDING') {
    const actionKey = LEGACY_NEXT_ACTION_KEY[status]
    const label = actionKey ? t(actionKey) : null
    if (!label) return null
    return (
      <div className="space-y-1">
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <Button size="sm" isLoading={loading} onClick={handleLegacyAdvance}>
          {label}
        </Button>
      </div>
    )
  }

  // CONFIRMED → prepare label via Sendcloud (main phase 1 flow).
  if (status === 'CONFIRMED' || status === 'PREPARING') {
    return (
      <div className="space-y-1">
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <Button size="sm" isLoading={loading} onClick={handlePrepare}>
          {loading ? t('vendor.fulfillment.preparing') : t('vendor.fulfillment.prepare')}
        </Button>
      </div>
    )
  }

  if (status === 'LABEL_REQUESTED') {
    return (
      <p className="text-xs text-[var(--muted)]">{t('vendor.fulfillment.preparing')}</p>
    )
  }

  if (status === 'LABEL_FAILED') {
    return (
      <div className="space-y-1">
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <Button size="sm" variant="secondary" isLoading={loading} onClick={handlePrepare}>
          {t('vendor.fulfillment.retryLabel')}
        </Button>
      </div>
    )
  }

  // READY / SHIPPED / DELIVERED: print label + view tracking + incident.
  if (['READY', 'SHIPPED', 'DELIVERED'].includes(status)) {
    return (
      <div className="flex flex-col items-end gap-1">
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {labelUrl && (
            <a
              href={labelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
            >
              {t('vendor.fulfillment.printLabel')}
            </a>
          )}
          {trackingUrl && (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-md border border-emerald-300 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
            >
              {t('vendor.fulfillment.viewTracking')}
            </a>
          )}
          {status !== 'DELIVERED' && (
            <Button size="sm" variant="secondary" isLoading={loading} onClick={handleIncident}>
              {t('vendor.fulfillment.markIncident')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return null
}
