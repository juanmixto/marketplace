'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { submitForReview, deleteProduct } from '@/domains/vendors/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline'
import { isProductExpired } from '@/domains/catalog/availability'
import { useT } from '@/i18n'

interface Props {
  product: { id: string; name: string; status: string; slug: string; expiresAt?: Date | string | null }
}

const PRODUCT_ACTIONS_OPEN_EVENT = 'product-actions:open'

export function ProductActions({ product }: Props) {
  const t = useT()
  const isExpired = isProductExpired(product.expiresAt)
  const instanceId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const [deleteModal, setDeleteModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onOtherOpen(e: Event) {
      if ((e as CustomEvent).detail !== instanceId) setMenuOpen(false)
    }
    window.addEventListener(PRODUCT_ACTIONS_OPEN_EVENT, onOtherOpen)
    return () => window.removeEventListener(PRODUCT_ACTIONS_OPEN_EVENT, onOtherOpen)
  }, [instanceId])

  useEffect(() => {
    if (!menuOpen) return
    function close() { setMenuOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  function toggleMenu() {
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setMenuOpen(true)
    window.dispatchEvent(new CustomEvent(PRODUCT_ACTIONS_OPEN_EVENT, { detail: instanceId }))
  }

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
          ref={buttonRef}
          onClick={toggleMenu}
          aria-label={t('vendor.productActions.menuLabel')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
        >
          <EllipsisVerticalIcon className="h-5 w-5" />
        </button>
      </div>
      {menuOpen && coords && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setMenuOpen(false)} />
          <div
            role="menu"
            style={{ top: coords.top, right: coords.right }}
            className="fixed z-[101] w-44 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
          >
            <Link
              href={`/vendor/productos/${product.id}`}
              className="block px-4 py-2 text-sm text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
              onClick={() => setMenuOpen(false)}
            >
              {t('vendor.productActions.edit')}
            </Link>
            {['DRAFT', 'REJECTED'].includes(product.status) && (
              <button
                onClick={handleSubmitReview}
                disabled={loading}
                aria-busy={loading || undefined}
                className="block w-full px-4 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-400 dark:hover:bg-emerald-950/35"
              >
                {loading ? t('vendor.productActions.sending') : t('vendor.productActions.sendReview')}
              </button>
            )}
            {product.status === 'ACTIVE' && !isExpired && (
              <Link
                href={`/productos/${product.slug}`}
                className="block px-4 py-2 text-sm text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                onClick={() => setMenuOpen(false)}
              >
                {t('vendor.productActions.viewInStore')}
              </Link>
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
        </>,
        document.body
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
