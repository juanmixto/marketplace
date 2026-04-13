'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'
import { approveVendor, rejectVendor, suspendVendor } from '@/domains/admin/actions'

interface Props {
  vendorId: string
  status: string
}

export function VendorModerationActions({ vendorId, status }: Props) {
  const t = useT()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>, key: string) {
    setLoading(key)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminProducers.actions.error'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}

      {['APPLYING', 'PENDING_DOCS'].includes(status) && (
        <>
          <Button
            size="sm"
            isLoading={loading === 'approve'}
            onClick={() => run(() => approveVendor(vendorId), 'approve')}
          >
            {t('adminProducers.actions.approve')}
          </Button>
          <Button
            size="sm"
            variant="danger"
            isLoading={loading === 'reject'}
            onClick={() => run(() => rejectVendor(vendorId), 'reject')}
          >
            {t('adminProducers.actions.reject')}
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
          {t('adminProducers.actions.suspend')}
        </Button>
      )}

      {status === 'SUSPENDED_TEMP' && (
        <Button
          size="sm"
          isLoading={loading === 'approve'}
          onClick={() => run(() => approveVendor(vendorId), 'approve')}
        >
          {t('adminProducers.actions.reactivate')}
        </Button>
      )}
    </div>
  )
}
