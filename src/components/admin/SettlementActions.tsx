'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { approveSettlement, markSettlementPaid } from '@/domains/admin/actions'

interface Props {
  settlementId: string
  status: string
}

export function SettlementActions({ settlementId, status }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>, key: string) {
    setLoading(key)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}

      {['DRAFT', 'PENDING_APPROVAL'].includes(status) && (
        <Button
          size="sm"
          isLoading={loading === 'approve'}
          onClick={() => run(() => approveSettlement(settlementId), 'approve')}
        >
          Aprobar
        </Button>
      )}

      {status === 'APPROVED' && (
        <Button
          size="sm"
          variant="secondary"
          isLoading={loading === 'paid'}
          onClick={() => run(() => markSettlementPaid(settlementId), 'paid')}
        >
          Marcar pagada
        </Button>
      )}
    </div>
  )
}
