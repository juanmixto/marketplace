'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { approveVendor, rejectVendor, suspendVendor } from '@/domains/admin/actions'

interface Props {
  vendorId: string
  status: string
}

export function VendorModerationActions({ vendorId, status }: Props) {
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
    <div className="flex flex-wrap items-center gap-2">
      {error && <p className="text-xs text-red-600 w-full">{error}</p>}

      {['APPLYING', 'PENDING_DOCS'].includes(status) && (
        <>
          <Button
            size="sm"
            isLoading={loading === 'approve'}
            onClick={() => run(() => approveVendor(vendorId), 'approve')}
          >
            Aprobar
          </Button>
          <Button
            size="sm"
            variant="danger"
            isLoading={loading === 'reject'}
            onClick={() => run(() => rejectVendor(vendorId), 'reject')}
          >
            Rechazar
          </Button>
        </>
      )}

      {status === 'ACTIVE' && (
        <Button
          size="sm"
          variant="secondary"
          isLoading={loading === 'suspend'}
          onClick={() => run(() => suspendVendor(vendorId), 'suspend')}
        >
          Suspender
        </Button>
      )}

      {status === 'SUSPENDED_TEMP' && (
        <Button
          size="sm"
          isLoading={loading === 'approve'}
          onClick={() => run(() => approveVendor(vendorId), 'approve')}
        >
          Reactivar
        </Button>
      )}
    </div>
  )
}
