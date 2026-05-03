'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import { submitForReview, deleteProduct, archiveProduct, restoreProduct } from '@/domains/vendors/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline'
import { isProductExpired } from '@/domains/catalog/availability'
import { useT } from '@/i18n'

interface Props {
  product: { id: string; name: string; status: string; slug: string; expiresAt?: Date | string | null; archivedAt?: Date | string | null }
}

const PRODUCT_ACTIONS_OPEN_EVENT = 'product-actions:open'

export function ProductActions({ product }: Props) {
  const t = useT()
  const isExpired = isProductExpired(product.expiresAt)
  const isArchived = !!product.archivedAt
  const instanceId = useId()
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { refs, floatingStyles, context } = useFloating({
    open: menuOpen,
    onOpenChange: open => {
      setMenuOpen(open)
      if (open) window.dispatchEvent(new CustomEvent(PRODUCT_ACTIONS_OPEN_EVENT, { detail: instanceId }))
    },
    placement: 'bottom-end',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8, fallbackAxisSideDirection: 'start' }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableWidth, elements }) {
          elements.floating.style.maxWidth = `${Math.min(availableWidth, 320)}px`
        },
      }),
    ],
  })

  const click = useClick(context)
  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true })
  const role = useRole(context, { role: 'menu' })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  useEffect(() => {
    function onOtherOpen(e: Event) {
      if ((e as CustomEvent).detail !== instanceId) setMenuOpen(false)
    }
    window.addEventListener(PRODUCT_ACTIONS_OPEN_EVENT, onOtherOpen)
    return () => window.removeEventListener(PRODUCT_ACTIONS_OPEN_EVENT, onOtherOpen)
  }, [instanceId])

  async function handleSubmitReview() {
    setLoading(true)
    try {
      await submitForReview(product.id)
    } catch (error) {
      setError(error instanceof Error ? error.message : t('vendor.productActions.sendError'))
    } finally {
      setLoading(false)
      setMenuOpen(false)
    }
  }

  async function handleArchive() {
    setLoading(true)
    setError(null)
    try {
      await archiveProduct(product.id)
    } catch (error) {
      setError(error instanceof Error ? error.message : t('vendor.productActions.archiveError'))
    } finally {
      setLoading(false)
      setMenuOpen(false)
    }
  }

  async function handleRestore() {
    setLoading(true)
    setError(null)
    try {
      await restoreProduct(product.id)
    } catch (error) {
      setError(error instanceof Error ? error.message : t('vendor.productActions.restoreError'))
    } finally {
      setLoading(false)
      setMenuOpen(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    try {
      await deleteProduct(product.id)
      setDeleteModal(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : t('vendor.productActions.deleteError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="shrink-0">
        <button
          ref={refs.setReference}
          aria-label={t('vendor.productActions.menuLabel')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
          {...getReferenceProps()}
        >
          <EllipsisVerticalIcon className="h-5 w-5" />
        </button>
      </div>
      {menuOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[101] w-44 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
            {...getFloatingProps()}
          >
            <Link
              href={`/vendor/productos/${product.id}`}
              className="block px-4 py-2 text-sm text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
              onClick={() => setMenuOpen(false)}
            >
              {t('vendor.productActions.edit')}
            </Link>
            {!isArchived && ['DRAFT', 'REJECTED'].includes(product.status) && (
              <button
                onClick={handleSubmitReview}
                disabled={loading}
                aria-busy={loading || undefined}
                className="block w-full px-4 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-400 dark:hover:bg-emerald-950/35"
              >
                {loading ? t('vendor.productActions.sending') : t('vendor.productActions.sendReview')}
              </button>
            )}
            {!isArchived && product.status === 'ACTIVE' && !isExpired && (
              <Link
                href={`/productos/${product.slug}`}
                className="block px-4 py-2 text-sm text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                onClick={() => setMenuOpen(false)}
              >
                {t('vendor.productActions.viewInStore')}
              </Link>
            )}
            {isArchived ? (
              <button
                onClick={handleRestore}
                disabled={loading}
                aria-busy={loading || undefined}
                className="block w-full px-4 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-400 dark:hover:bg-emerald-950/35"
              >
                {loading ? t('vendor.productActions.restoring') : t('vendor.productActions.restore')}
              </button>
            ) : (
              ['ACTIVE', 'PENDING_REVIEW', 'REJECTED'].includes(product.status) && (
                <button
                  onClick={handleArchive}
                  disabled={loading}
                  aria-busy={loading || undefined}
                  className="block w-full px-4 py-2 text-left text-sm text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? t('vendor.productActions.archiving') : t('vendor.productActions.archive')}
                </button>
              )
            )}
            <div className="border-t border-[var(--border)] mt-1 pt-1">
              <button
                onClick={() => { setDeleteModal(true); setMenuOpen(false) }}
                className="block w-full px-4 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/35"
              >
                {t('vendor.productActions.delete')}
              </button>
            </div>
          </div>
        </FloatingPortal>
      )}

      <Modal
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        title={t('vendor.productActions.deleteTitle')}
        size="sm"
      >
        <div className="p-5 space-y-4">
          <p className="text-sm text-[var(--foreground-soft)]">
            {t('vendor.productActions.deleteConfirm').replace('{name}', product.name)}
          </p>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setDeleteModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" size="sm" isLoading={loading} onClick={handleDelete}>
              {t('vendor.productActions.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
