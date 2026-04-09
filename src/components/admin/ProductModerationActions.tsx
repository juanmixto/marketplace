'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { reviewProduct } from '@/domains/admin/actions'

interface Props {
  productId: string
  productName: string
  status: string
}

export function ProductModerationActions({ productId, productName, status }: Props) {
  const [rejectModal, setRejectModal] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status !== 'PENDING_REVIEW') return null

  async function handleApprove() {
    setLoading(true)
    setError(null)
    try {
      await reviewProduct(productId, 'approve')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aprobar')
    } finally {
      setLoading(false)
    }
  }

  async function handleReject() {
    setLoading(true)
    setError(null)
    try {
      await reviewProduct(productId, 'reject', reason || undefined)
      setRejectModal(false)
      setReason('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al rechazar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button size="sm" isLoading={loading} onClick={handleApprove}>
          Aprobar
        </Button>
        <Button size="sm" variant="danger" onClick={() => setRejectModal(true)}>
          Rechazar
        </Button>
      </div>

      <Modal
        open={rejectModal}
        onClose={() => setRejectModal(false)}
        title="Rechazar producto"
        size="sm"
      >
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Rechazar <strong>{productName}</strong>. El productor recibirá el motivo.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
              Motivo (opcional)
            </label>
            <textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/20"
              placeholder="Las imágenes no cumplen los requisitos mínimos..."
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setRejectModal(false)}>
              Cancelar
            </Button>
            <Button variant="danger" size="sm" isLoading={loading} onClick={handleReject}>
              Rechazar producto
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
