'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { advanceFulfillment } from '@/domains/vendors/actions'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'

const NEXT_ACTION_KEY: Record<string, TranslationKeys> = {
  PENDING:   'vendor.fulfillment.confirm',
  CONFIRMED: 'vendor.fulfillment.startPrep',
  PREPARING: 'vendor.fulfillment.markReady',
  READY:     'vendor.fulfillment.markShipped',
}

interface Props {
  fulfillmentId: string
  status: string
}

export function FulfillmentActions({ fulfillmentId, status }: Props) {
  const t = useT()
  const actionKey = NEXT_ACTION_KEY[status]
  const nextAction = actionKey ? t(actionKey) : null
  const [shipModal, setShipModal] = useState(false)
  const [tracking, setTracking] = useState('')
  const [carrier, setCarrier] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!nextAction) return null

  async function handleAdvance(trackingNumber?: string, carrierName?: string) {
    setLoading(true)
    setError(null)
    try {
      await advanceFulfillment(fulfillmentId, trackingNumber, carrierName)
      setShipModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('vendor.fulfillment.updateError'))
    } finally {
      setLoading(false)
    }
  }

  if (status === 'READY') {
    return (
      <>
        <Button size="sm" onClick={() => setShipModal(true)}>
          {nextAction}
        </Button>

        <Modal
          open={shipModal}
          onClose={() => setShipModal(false)}
          title={t('vendor.fulfillment.confirmShipping')}
          size="sm"
        >
          <div className="p-5 space-y-4">
            <p className="text-sm text-[var(--foreground-soft)]">{t('vendor.fulfillment.optionalTracking')}</p>
            <Input
              label={t('vendor.fulfillment.trackingLabel')}
              placeholder="ES123456789"
              value={tracking}
              onChange={e => setTracking(e.target.value)}
            />
            <Input
              label={t('vendor.fulfillment.carrierLabel')}
              placeholder="Correos, MRW, DHL..."
              value={carrier}
              onChange={e => setCarrier(e.target.value)}
            />
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setShipModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                isLoading={loading}
                onClick={() => handleAdvance(tracking || undefined, carrier || undefined)}
              >
                {t('vendor.fulfillment.confirmShipping')}
              </Button>
            </div>
          </div>
        </Modal>
      </>
    )
  }

  return (
    <div className="space-y-1">
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <Button size="sm" isLoading={loading} onClick={() => handleAdvance()}>
        {nextAction}
      </Button>
    </div>
  )
}
