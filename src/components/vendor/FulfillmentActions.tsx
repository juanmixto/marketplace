'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  prepareFulfillment,
  markFulfillmentIncident,
  resolveFulfillmentIncident,
} from '@/domains/shipping/actions'
import { useT } from '@/i18n'

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

  async function handleResolveIncident() {
    setLoading(true)
    setError(null)
    try {
      const result = await resolveFulfillmentIncident(fulfillmentId)
      if (!result.ok) {
        setError(result.message || t('vendor.fulfillment.updateError'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('vendor.fulfillment.updateError'))
    } finally {
      setLoading(false)
    }
  }

  // PENDING/CONFIRMED/PREPARING all share the same primary action: generate
  // the Sendcloud label. PENDING is implicitly confirmed by `prepareFulfillment`.
  if (['PENDING', 'CONFIRMED', 'PREPARING'].includes(status)) {
    return (
      <div className="flex flex-col items-end gap-1">
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <Button size="sm" isLoading={loading} onClick={handlePrepare}>
          {loading ? t('vendor.fulfillment.preparing') : t('vendor.fulfillment.prepare')}
        </Button>
        <p className="max-w-[220px] text-right text-xs text-[var(--muted)]">
          {t('vendor.fulfillment.hintPrepare')}
        </p>
      </div>
    )
  }

  if (status === 'LABEL_REQUESTED') {
    return (
      <div className="flex flex-col items-end gap-1">
        <p className="text-xs text-[var(--muted)]">{t('vendor.fulfillment.preparing')}</p>
        <p className="max-w-[220px] text-right text-xs text-[var(--muted-light)]">
          {t('vendor.fulfillment.hintLabelRequested')}
        </p>
      </div>
    )
  }

  if (status === 'LABEL_FAILED') {
    return (
      <div className="flex flex-col items-end gap-1">
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <Button size="sm" variant="secondary" isLoading={loading} onClick={handlePrepare}>
          {t('vendor.fulfillment.retryLabel')}
        </Button>
        <p className="max-w-[220px] text-right text-xs text-[var(--muted)]">
          {t('vendor.fulfillment.hintLabelFailed')}
        </p>
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
        {status === 'READY' && (
          <p className="max-w-[260px] text-right text-xs text-[var(--muted)]">
            {t('vendor.fulfillment.hintReady')}
          </p>
        )}
      </div>
    )
  }

  if (status === 'INCIDENT') {
    return (
      <div className="flex flex-col items-end gap-1">
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {labelUrl && (
            <a
              href={labelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-md border border-emerald-300 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
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
          <Button size="sm" isLoading={loading} onClick={handleResolveIncident}>
            {t('vendor.fulfillment.resolveIncident')}
          </Button>
        </div>
        <p className="max-w-[260px] text-right text-xs text-[var(--muted)]">
          {t('vendor.fulfillment.hintIncident')}
        </p>
      </div>
    )
  }

  return null
}
