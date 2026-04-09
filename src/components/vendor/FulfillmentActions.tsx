'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { advanceFulfillment } from '@/domains/vendors/actions'

const NEXT_ACTION: Record<string, string> = {
  PENDING:   'Confirmar pedido',
  CONFIRMED: 'Empezar preparación',
  PREPARING: 'Marcar listo',
  READY:     'Marcar enviado',
}

interface Props {
  fulfillmentId: string
  status: string
}

export function FulfillmentActions({ fulfillmentId, status }: Props) {
  const nextAction = NEXT_ACTION[status]
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
      setError(err instanceof Error ? err.message : 'Error al actualizar el pedido')
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
          title="Confirmar envío"
          size="sm"
        >
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-600">Opcional: añade el número de seguimiento.</p>
            <Input
              label="Número de seguimiento"
              placeholder="ES123456789"
              value={tracking}
              onChange={e => setTracking(e.target.value)}
            />
            <Input
              label="Transportista"
              placeholder="Correos, MRW, DHL..."
              value={carrier}
              onChange={e => setCarrier(e.target.value)}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setShipModal(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                isLoading={loading}
                onClick={() => handleAdvance(tracking || undefined, carrier || undefined)}
              >
                Confirmar envío
              </Button>
            </div>
          </div>
        </Modal>
      </>
    )
  }

  return (
    <div className="space-y-1">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button size="sm" isLoading={loading} onClick={() => handleAdvance()}>
        {nextAction}
      </Button>
    </div>
  )
}
