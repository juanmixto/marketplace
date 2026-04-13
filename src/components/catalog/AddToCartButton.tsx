'use client'

import { useState } from 'react'
import { useLocale } from '@/i18n'
import { useCartStore } from '@/domains/orders/cart-store'
import { Button, type ButtonProps } from '@/components/ui/button'
import { createAnalyticsItem, trackAnalyticsEvent } from '@/lib/analytics'
import { getCatalogCopy } from '@/i18n/catalog-copy'
import { ShoppingCartIcon, CheckIcon } from '@heroicons/react/24/outline'

interface Props {
  productId: string
  variantId?: string
  variantName?: string
  productName: string
  disabled?: boolean
  disabledLabel?: string
  compact?: boolean
  quantity?: number
  price?: number
  slug?: string
  image?: string
  unit?: string
  vendorId?: string
  vendorName?: string
  size?: ButtonProps['size']
  className?: string
}

export function AddToCartButton({
  productId,
  variantId,
  variantName,
  productName,
  disabled,
  disabledLabel,
  compact = false,
  quantity = 1,
  price = 0,
  slug = '',
  image,
  unit = 'ud',
  vendorId = '',
  vendorName = '',
  size = 'lg',
  className,
}: Props) {
  const { locale } = useLocale()
  const copy = getCatalogCopy(locale)
  const addItem = useCartStore(s => s.addItem)
  const [added, setAdded] = useState(false)
  const quantityToAdd = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1

  function handleAdd() {
    addItem({
      productId,
      variantId,
      variantName,
      name: productName,
      slug,
      image,
      price,
      unit,
      vendorId,
      vendorName,
      quantity: quantityToAdd,
    })
    trackAnalyticsEvent('add_to_cart', {
      currency: 'EUR',
      value: price * quantityToAdd,
      items: [
        createAnalyticsItem({
          id: productId,
          name: productName,
          price,
          quantity: quantityToAdd,
          variant: variantName,
          brand: vendorName,
        }),
      ],
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  const idleLabel = compact
    ? quantityToAdd > 1
      ? copy.actions.addCompact(quantityToAdd)
      : copy.actions.add
    : quantityToAdd > 1
      ? copy.actions.addMany(quantityToAdd)
      : copy.actions.addToCart
  const successLabel = compact
    ? copy.actions.added
    : quantityToAdd > 1
      ? copy.actions.addedMany(quantityToAdd)
      : copy.actions.addedToCart

  return (
    <Button
      onClick={handleAdd}
      disabled={disabled}
      size={size}
      className={className ?? 'w-full shadow-sm'}
      variant={added ? 'secondary' : 'primary'}
    >
      {disabled ? (
        <>
          <ShoppingCartIcon className="h-5 w-5" />
          {disabledLabel ?? idleLabel}
        </>
      ) : added ? (
        <>
          <CheckIcon className="h-5 w-5" />
          {successLabel}
        </>
      ) : (
        <>
          <ShoppingCartIcon className="h-5 w-5" />
          {idleLabel}
        </>
      )}
    </Button>
  )
}
