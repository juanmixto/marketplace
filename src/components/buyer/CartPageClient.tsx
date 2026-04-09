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
        <ShoppingBagIcon className="mx-auto mb-4 h-16 w-16 text-gray-300" />
        <h1 className="text-2xl font-bold text-gray-900">Tu carrito está vacío</h1>
        <p className="mt-2 text-gray-500">Explora nuestros productos y añade los que más te gusten.</p>
        <Link href="/productos" className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700">
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
      <h1 className="mb-8 text-2xl font-bold text-gray-900">Tu carrito ({items.length})</h1>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {items.map(item => (
            <div key={`${item.productId}-${item.variantId}`}
              className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {item.image ? (
                  <Image src={item.image} alt={item.name} fill className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-2xl">🌿</div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link href={`/productos/${item.slug}`} className="line-clamp-1 font-medium text-gray-900 hover:text-emerald-600">
                  {item.name}
                </Link>
                <p className="text-xs text-gray-500">{item.vendorName}</p>
                <p className="text-sm font-semibold text-gray-900">
                  {formatPrice(item.price)} / {item.unit}
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <div className="flex items-center gap-1 rounded-lg border border-gray-200">
                    <button onClick={() => updateQty(item.productId, item.quantity - 1, item.variantId)}
                      className="rounded-l-lg p-1.5 hover:bg-gray-50">
                      <MinusIcon className="h-3.5 w-3.5 text-gray-600" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <button onClick={() => updateQty(item.productId, item.quantity + 1, item.variantId)}
                      className="rounded-r-lg p-1.5 hover:bg-gray-50">
                      <PlusIcon className="h-3.5 w-3.5 text-gray-600" />
                    </button>
                  </div>
                  <button onClick={() => removeItem(item.productId, item.variantId)}
                    className="text-gray-400 hover:text-red-500">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold text-gray-900">{formatPrice(item.price * item.quantity)}</p>
              </div>
            </div>
          ))}
          <button onClick={clearCart} className="mt-2 text-sm text-gray-400 hover:text-red-500">
            Vaciar carrito
          </button>
        </div>

        <div>
          <div className="sticky top-24 rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 font-semibold text-gray-900">Resumen del pedido</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatPrice(sub)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Envío</span>
                <span>{shipping === 0 ? <span className="text-emerald-600">Gratis</span> : formatPrice(shipping)}</span>
              </div>
              {shipping > 0 && (
                <p className="text-xs text-gray-400">
                  Envío gratis a partir de {formatPrice(shippingSettings.FREE_SHIPPING_THRESHOLD)}
                </p>
              )}
              <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold text-gray-900">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
            <Link href="/checkout">
              <Button className="mt-4 w-full" size="lg">Ir al checkout</Button>
            </Link>
            <Link href="/productos" className="mt-3 block text-center text-sm text-gray-500 hover:text-emerald-600">
              Seguir comprando
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
