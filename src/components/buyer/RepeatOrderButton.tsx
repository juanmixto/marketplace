'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowPathIcon, CheckIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { useCartStore } from '@/lib/cart-store'

interface RepeatOrderLine {
  id: string
  productId: string
  vendorId: string
  variantId?: string | null
  quantity: number
  unitPrice: number | string
  product: {
    name: string
    slug: string
    images?: string[]
  }
  productSnapshot?: unknown
}

interface RepeatOrderButtonProps {
  orderNumber: string
  lines: RepeatOrderLine[]
}

type SnapshotShape = {
  name?: string
  slug?: string
  images?: string[]
  unit?: string
  vendorName?: string
  variantName?: string | null
}

function isSnapshotShape(value: unknown): value is SnapshotShape {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function RepeatOrderButton({ orderNumber, lines }: RepeatOrderButtonProps) {
  const router = useRouter()
  const addItem = useCartStore(state => state.addItem)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAdded, setIsAdded] = useState(false)

  const validLines = lines.filter(line => line.product?.slug)
  const totalUnits = validLines.reduce((sum, line) => sum + Math.max(1, line.quantity), 0)

  function handleRepeatOrder() {
    if (validLines.length === 0 || isSubmitting) return

    setIsSubmitting(true)

    for (const line of validLines) {
      const snapshot = isSnapshotShape(line.productSnapshot) ? line.productSnapshot : undefined
      const unitPrice = typeof line.unitPrice === 'number' ? line.unitPrice : Number(line.unitPrice)

      addItem({
        productId: line.productId,
        variantId: line.variantId ?? undefined,
        variantName: snapshot?.variantName ?? undefined,
        name: snapshot?.name ?? line.product.name,
        slug: snapshot?.slug ?? line.product.slug,
        image: snapshot?.images?.[0] ?? line.product.images?.[0],
        price: Number.isFinite(unitPrice) ? unitPrice : 0,
        unit: snapshot?.unit ?? 'unidad',
        vendorId: line.vendorId,
        vendorName: snapshot?.vendorName ?? 'Mercado Productor',
        quantity: Math.max(1, line.quantity),
      })
    }

    setIsAdded(true)
    router.push('/carrito')

    window.setTimeout(() => {
      setIsSubmitting(false)
      setIsAdded(false)
    }, 1200)
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={handleRepeatOrder}
      disabled={validLines.length === 0 || isSubmitting}
      aria-label={`Repetir compra del pedido ${orderNumber}`}
      className="whitespace-nowrap"
    >
      {isAdded ? <CheckIcon className="h-4 w-4" /> : <ArrowPathIcon className="h-4 w-4" />}
      {isAdded ? 'Añadido al carrito' : `Repetir compra${totalUnits > 0 ? ` · ${totalUnits} uds.` : ''}`}
    </Button>
  )
}
