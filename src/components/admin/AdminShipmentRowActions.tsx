'use client'

import { useState, useTransition } from 'react'
import { adminRetryShipment, adminRefreshTracking } from '@/domains/shipping/admin-actions'
import { useT } from '@/i18n'

interface Props {
  shipmentId: string
  canRetry: boolean
}

export function AdminShipmentRowActions({ shipmentId, canRetry }: Props) {
  const t = useT()
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRetry() {
    setMessage(null)
    startTransition(async () => {
      const res = await adminRetryShipment(shipmentId)
      setMessage(res.ok ? t('admin.actions.requeued') : res.message)
    })
  }

  function handleRefresh() {
    setMessage(null)
    startTransition(async () => {
      const res = await adminRefreshTracking(shipmentId)
      setMessage(res.ok ? t('admin.actions.trackingUpdated') : res.message ?? t('admin.actions.trackingError'))
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {canRetry && (
          <button
            type="button"
            disabled={isPending}
            onClick={handleRetry}
            className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {t('admin.actions.retry')}
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={handleRefresh}
          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] disabled:opacity-50"
        >
          {t('admin.actions.refresh')}
        </button>
      </div>
      {message && (
        <span className="text-[10px] text-[var(--muted)]">{message}</span>
      )}
    </div>
  )
}
