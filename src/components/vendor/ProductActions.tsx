'use client'

import { useState } from 'react'
import Link from 'next/link'
import { submitForReview, deleteProduct } from '@/domains/vendors/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline'
import { isProductExpired } from '@/domains/catalog/availability'

interface Props {
  product: { id: string; name: string; status: string; slug: string; expiresAt?: Date | string | null }
}

export function ProductActions({ product }: Props) {
  const isExpired = isProductExpired(product.expiresAt)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmitReview() {
    setLoading(true)
    try {
      await submitForReview(product.id)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo enviar el producto a revisión')
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
      setError(error instanceof Error ? error.message : 'No se pudo eliminar el producto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="relative shrink-0">
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
        >
          <EllipsisVerticalIcon className="h-5 w-5" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 shadow-2xl ring-1 ring-black/5 backdrop-blur dark:ring-white/10">
              <Link
                href={`/vendor/productos/${product.id}`}
                className="block px-4 py-2 text-sm text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                onClick={() => setMenuOpen(false)}
              >
                Editar
              </Link>
              {['DRAFT', 'REJECTED'].includes(product.status) && (
                <button
                  onClick={handleSubmitReview}
                  disabled={loading}
                  aria-busy={loading || undefined}
                  className="block w-full px-4 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-400 dark:hover:bg-emerald-950/35"
                >
                  {loading ? 'Enviando…' : 'Enviar a revisión'}
                </button>
              )}
              {product.status === 'ACTIVE' && !isExpired && (
                <Link
                  href={`/productos/${product.slug}`}
                  target="_blank"
                  className="block px-4 py-2 text-sm text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                >
                  Ver en tienda ↗
                </Link>
              )}
              <div className="border-t border-[var(--border)] mt-1 pt-1">
                <button
                  onClick={() => { setDeleteModal(true); setMenuOpen(false) }}
                  className="block w-full px-4 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/35"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        title="Eliminar producto"
        size="sm"
      >
        <div className="p-5 space-y-4">
          <p className="text-sm text-[var(--foreground-soft)]">
            ¿Eliminar <strong>{product.name}</strong>? Esta acción no se puede deshacer.
          </p>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setDeleteModal(false)}>
              Cancelar
            </Button>
            <Button variant="danger" size="sm" isLoading={loading} onClick={handleDelete}>
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
