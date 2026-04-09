'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useCartStore } from '@/lib/cart-store'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/utils'
import { TrashIcon, MinusIcon, PlusIcon, ShoppingBagIcon } from '@heroicons/react/24/outline'
import { calculateShippingCost, type PublicMarketplaceSettings } from '@/lib/marketplace-settings'

interface Props {
  shippingSettings: Pick<PublicMarketplaceSettings, 'FREE_SHIPPING_THRESHOLD' | 'FLAT_SHIPPING_COST'>
}

export function CartPageClient({ shippingSettings }: Props) {
  const { items, removeItem, updateQty, subtotal, clearCart } = useCartStore()

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <ShoppingBagIcon className="mx-auto mb-4 h-16 w-16 text-[var(--muted-light)]" />
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Tu carrito está vacío</h1>
        <p className="mt-2 text-[var(--muted)]">Explora nuestros productos y añade los que más te gusten.</p>
        <Link href="/productos" className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400">
          Explorar productos
        </Link>
      </div>
    )
  }

  const sub = subtotal()
  const shipping = calculateShippingCost(sub, shippingSettings)
  const total = sub + shipping

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="mb-8 text-2xl font-bold text-[var(--foreground)]">Tu carrito ({items.length})</h1>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {items.map(item => (
            <div key={`${item.productId}-${item.variantId}`}
              className="flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
                {item.image ? (
                  <Image src={item.image} alt={item.name} fill className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-2xl">🌿</div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link href={`/productos/${item.slug}`} className="line-clamp-1 font-medium text-[var(--foreground)] hover:text-emerald-600 dark:hover:text-emerald-400">
                  {item.name}
                </Link>
                {item.variantName && (
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{item.variantName}</p>
                )}
                <p className="text-xs text-[var(--muted)]">{item.vendorName}</p>
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  {formatPrice(item.price)} / {item.unit}
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <div className="flex items-center gap-1 rounded-lg border border-[var(--border)]">
                    <button onClick={() => updateQty(item.productId, item.quantity - 1, item.variantId)}
                      className="rounded-l-lg p-1.5 hover:bg-[var(--surface-raised)]">
                      <MinusIcon className="h-3.5 w-3.5 text-[var(--foreground-soft)]" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium text-[var(--foreground)]">{item.quantity}</span>
                    <button onClick={() => updateQty(item.productId, item.quantity + 1, item.variantId)}
                      className="rounded-r-lg p-1.5 hover:bg-[var(--surface-raised)]">
                      <PlusIcon className="h-3.5 w-3.5 text-[var(--foreground-soft)]" />
                    </button>
                  </div>
                  <button onClick={() => removeItem(item.productId, item.variantId)}
                    className="text-[var(--muted)] hover:text-red-500">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold text-[var(--foreground)]">{formatPrice(item.price * item.quantity)}</p>
              </div>
            </div>
          ))}
          <button onClick={clearCart} className="mt-2 text-sm text-[var(--muted)] hover:text-red-500">
            Vaciar carrito
          </button>
        </div>

        <div>
          <div className="sticky top-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="mb-4 font-semibold text-[var(--foreground)]">Resumen del pedido</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-[var(--foreground-soft)]">
                <span>Subtotal</span>
                <span>{formatPrice(sub)}</span>
              </div>
              <div className="flex justify-between text-[var(--foreground-soft)]">
                <span>Envío</span>
                <span>{shipping === 0 ? <span className="text-emerald-600 dark:text-emerald-400">Gratis</span> : formatPrice(shipping)}</span>
              </div>
              {shipping > 0 && (
                <p className="text-xs text-[var(--muted-light)]">
                  Envío gratis a partir de {formatPrice(shippingSettings.FREE_SHIPPING_THRESHOLD)}
                </p>
              )}
              <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-bold text-[var(--foreground)]">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
            <Link href="/checkout">
              <Button className="mt-4 w-full" size="lg">Ir al checkout</Button>
            </Link>
            <Link href="/productos" className="mt-3 block text-center text-sm text-[var(--muted)] hover:text-emerald-600 dark:hover:text-emerald-400">
              Seguir comprando
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
