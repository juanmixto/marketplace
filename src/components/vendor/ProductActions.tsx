'use client'

import { useState } from 'react'
import Link from 'next/link'
import { submitForReview, deleteProduct } from '@/domains/vendors/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline'

interface Props {
  product: { id: string; name: string; status: string; slug: string }
}

export function ProductActions({ product }: Props) {
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
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <EllipsisVerticalIcon className="h-5 w-5" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-gray-200 bg-white shadow-lg py-1">
              <Link
                href={`/vendor/productos/${product.id}`}
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                Editar
              </Link>
              {['DRAFT', 'REJECTED'].includes(product.status) && (
                <button
                  onClick={handleSubmitReview}
                  disabled={loading}
                  className="block w-full text-left px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                >
                  Enviar a revisión
                </button>
              )}
              {product.status === 'ACTIVE' && (
                <Link
                  href={`/productos/${product.slug}`}
                  target="_blank"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Ver en tienda ↗
                </Link>
              )}
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  onClick={() => { setDeleteModal(true); setMenuOpen(false) }}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
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
          <p className="text-sm text-gray-600">
            ¿Eliminar <strong>{product.name}</strong>? Esta acción no se puede deshacer.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
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
