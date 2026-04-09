'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { StarRating } from '@/components/reviews/StarRating'
import { createReview } from '@/domains/reviews/actions'

interface Props {
  orderId: string
  productId: string
  productName: string
}

export function ReviewFormButton({ orderId, productId, productName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(5)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)

    startTransition(async () => {
      try {
        await createReview(orderId, productId, rating, body || undefined)
        setOpen(false)
        setBody('')
        setRating(5)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo enviar la reseña')
      }
    })
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Dejar reseña
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Valorar ${productName}`} size="md">
        <div className="space-y-5 p-5">
          <div>
            <p className="text-sm font-medium text-gray-900">Tu valoración</p>
            <div className="mt-3 flex gap-2">
              {Array.from({ length: 5 }, (_, index) => {
                const value = index + 1
                const active = value <= rating

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className={`rounded-xl border px-3 py-2 transition ${
                      active
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-gray-200 hover:border-amber-200 hover:bg-gray-50'
                    }`}
                    aria-label={`${value} estrellas`}
                  >
                    <StarRating rating={value} size="sm" />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label htmlFor={`review-${productId}`} className="text-sm font-medium text-gray-900">
              Comentario
            </label>
            <textarea
              id={`review-${productId}`}
              rows={5}
              maxLength={1000}
              value={body}
              onChange={event => setBody(event.target.value)}
              placeholder="Cuenta que te ha parecido el producto, el sabor, la frescura o la presentacion."
              className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <p className="mt-1 text-xs text-gray-400">{body.length}/1000</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button isLoading={isPending} onClick={handleSubmit}>
              Publicar reseña
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
