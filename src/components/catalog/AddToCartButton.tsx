'use client'

import { useState } from 'react'
import { useCartStore } from '@/lib/cart-store'
import { Button } from '@/components/ui/button'
import { ShoppingCartIcon, CheckIcon } from '@heroicons/react/24/outline'

interface Props {
  productId: string
  variantId?: string
  productName: string
  disabled?: boolean
  price?: number
  slug?: string
  image?: string
  unit?: string
  vendorId?: string
  vendorName?: string
}

export function AddToCartButton({
  productId,
  variantId,
  productName,
  disabled,
  price = 0,
  slug = '',
  image,
  unit = 'ud',
  vendorId = '',
  vendorName = '',
}: Props) {
  const addItem = useCartStore(s => s.addItem)
  const [added, setAdded] = useState(false)

  function handleAdd() {
    addItem({ productId, variantId, name: productName, slug, image, price, unit, vendorId, vendorName })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <Button
      onClick={handleAdd}
      disabled={disabled}
      size="lg"
      className="w-full"
      variant={added ? 'secondary' : 'primary'}
    >
      {added ? (
        <><CheckIcon className="h-5 w-5" /> Añadido al carrito</>
      ) : (
        <><ShoppingCartIcon className="h-5 w-5" /> Añadir al carrito</>
      )}
    </Button>
  )
}
