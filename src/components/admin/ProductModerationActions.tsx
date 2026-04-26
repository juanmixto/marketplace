'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { reviewProduct } from '@/domains/admin/actions'
import { useT } from '@/i18n'

interface Props {
  productId: string
  productName: string
  status: string
}

export function ProductModerationActions({ productId, productName, status }: Props) {
  const t = useT()
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
      setError(err instanceof Error ? err.message : t('admin.products.moderation.errorApprove'))
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
      setError(err instanceof Error ? err.message : t('admin.products.moderation.errorReject'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          <Button size="sm" isLoading={loading} onClick={handleApprove}>
            {t('admin.actions.approve')}
          </Button>
          <Button size="sm" variant="danger" disabled={loading} onClick={() => setRejectModal(true)}>
            {t('admin.actions.reject')}
          </Button>
        </div>
        {error && (
          <p
            className="max-w-[16rem] text-right text-xs leading-tight text-red-600 dark:text-red-400"
            title={error}
          >
            {error}
          </p>
        )}
      </div>

      <Modal
        open={rejectModal}
        onClose={() => setRejectModal(false)}
        title={t('admin.products.moderation.modalTitle')}
        size="sm"
      >
        <div className="p-5 space-y-4">
          <p className="text-sm text-[var(--foreground-soft)]">
            {t('admin.products.moderation.modalIntroPrefix')} <strong>{productName}</strong>{t('admin.products.moderation.modalIntroSuffix')}
          </p>
          <div className="space-y-1.5">
            <label htmlFor="reason" className="block text-sm font-medium text-[var(--foreground)]">
              {t('admin.products.moderation.reasonLabel')}
            </label>
            <textarea
              id="reason"
              rows={3}
              spellCheck
              autoCapitalize="sentences"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-light)] focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:focus:border-red-300 dark:focus:ring-red-400/25"
              placeholder={t('admin.products.moderation.reasonPlaceholder')}
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setRejectModal(false)}>
              {t('admin.actions.cancel')}
            </Button>
            <Button variant="danger" size="sm" isLoading={loading} onClick={handleReject}>
              {t('admin.products.moderation.confirmReject')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
