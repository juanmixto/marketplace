'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { deleteShippingRate } from '@/domains/admin/actions'
import { useT } from '@/i18n'

interface Props {
  rateId: string
}

export function ShippingRateActions({ rateId }: Props) {
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    try {
      await deleteShippingRate(rateId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.actions.trackingError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
      <Button size="sm" variant="danger" isLoading={loading} onClick={handleDelete}>
        {t('admin.actions.delete')}
      </Button>
    </div>
  )
}
