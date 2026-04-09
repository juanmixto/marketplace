'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { deleteShippingRate } from '@/domains/admin/actions'

interface Props {
  rateId: string
}

export function ShippingRateActions({ rateId }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    try {
      await deleteShippingRate(rateId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
      <Button size="sm" variant="danger" isLoading={loading} onClick={handleDelete}>
        Eliminar
      </Button>
    </div>
  )
}
