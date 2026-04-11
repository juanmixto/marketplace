'use client'

import Link from 'next/link'
import { useCartStore } from '@/lib/cart-store'
import { Button } from '@/components/ui/button'
import { SafeImage } from '@/components/catalog/SafeImage'
import { formatPrice } from '@/lib/utils'
import { TrashIcon, MinusIcon, PlusIcon, ShoppingBagIcon } from '@heroicons/react/24/outline'
import { calculateShippingCost, type PublicMarketplaceSettings } from '@/lib/marketplace-settings'
import { useT } from '@/i18n'

interface Props {
  shippingSettings: Pick<PublicMarketplaceSettings, 'FREE_SHIPPING_THRESHOLD' | 'FLAT_SHIPPING_COST'>
}

export function CartPageClient({ shippingSettings }: Props) {
  const { items, removeItem, updateQty, subtotal, clearCart, itemCount } = useCartStore()
  const t = useT()

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-sm">
          <ShoppingBagIcon className="mx-auto mb-4 h-16 w-16 text-[var(--muted)]" />
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('cart.empty')}</h1>
          <p className="mt-2 text-[var(--muted)]">{t('cart.emptyDesc')}</p>
          <Link href="/productos" className="mt-6 inline-flex rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-sm shadow-emerald-950/10 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400">
            {t('cart.emptyBtn')}
          </Link>
        </div>
      </div>
    )
  }

  const sub = subtotal()
  const shipping = calculateShippingCost(sub, shippingSettings)
  const total = sub + shipping

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="mb-8 text-2xl font-bold text-[var(--foreground)]">{t('cart.title')} ({itemCount()})</h1>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="order-last space-y-3 lg:order-first lg:col-span-2">
          {items.map(item => (
            <div key={`${item.productId}-${item.variantId}`}
              className="flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
                {item.image ? (
                  <SafeImage src={item.image} alt={item.name} fill className="object-cover" sizes="80px" />
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
                    <button
                      type="button"
                      onClick={() => updateQty(item.productId, item.quantity - 1, item.variantId)}
                      aria-label={`Reducir cantidad de ${item.name}`}
                      className="rounded-l-lg p-1.5 hover:bg-[var(--surface-raised)]"
                    >
                      <MinusIcon className="h-3.5 w-3.5 text-[var(--foreground-soft)]" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={event => {
                        const nextQuantity = Number.parseInt(event.target.value, 10)
                        if (Number.isNaN(nextQuantity)) return
                        updateQty(item.productId, nextQuantity, item.variantId)
                      }}
                      className="w-12 bg-transparent text-center text-sm font-medium text-[var(--foreground)] focus:outline-none"
                      aria-label={`Cantidad de ${item.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => updateQty(item.productId, item.quantity + 1, item.variantId)}
                      aria-label={`Aumentar cantidad de ${item.name}`}
                      className="rounded-r-lg p-1.5 hover:bg-[var(--surface-raised)]"
                    >
                      <PlusIcon className="h-3.5 w-3.5 text-[var(--foreground-soft)]" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.productId, item.variantId)}
                    aria-label={`Eliminar ${item.name} del carrito`}
                    className="text-[var(--muted)] hover:text-red-600 dark:hover:text-red-400"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold text-[var(--foreground)]">{formatPrice(item.price * item.quantity)}</p>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={clearCart}
            aria-label={t('cart.clearCart')}
            className="mt-2 text-sm text-[var(--muted)] hover:text-red-600 dark:hover:text-red-400"
          >
            {t('cart.clearCart')}
          </button>
        </div>

        <div className="order-first lg:order-last">
          <div className="sticky top-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="mb-4 font-semibold text-[var(--foreground)]">{t('cart.summary')}</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-[var(--foreground-soft)]">
                <span>{t('cart.subtotal')}</span>
                <span>{formatPrice(sub)}</span>
              </div>
              <div className="flex justify-between text-[var(--foreground-soft)]">
                <span>{t('cart.shipping')}</span>
                <span>{shipping === 0 ? <span className="text-emerald-600 dark:text-emerald-400">{t('cart.shippingFree')}</span> : formatPrice(shipping)}</span>
              </div>
              {shipping > 0 && (
                <p className="text-xs text-[var(--muted-light)]">
                  {t('cart.shippingFrom')} {formatPrice(shippingSettings.FREE_SHIPPING_THRESHOLD)}
                </p>
              )}
              <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-bold text-[var(--foreground)]">
                <span>{t('cart.total')}</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
            <Link href="/checkout">
              <Button className="mt-4 w-full" size="lg">{t('cart.toCheckout')}</Button>
            </Link>
            <Link href="/productos" className="mt-3 block text-center text-sm text-[var(--muted)] hover:text-emerald-600 dark:hover:text-emerald-400">
              {t('cart.continueShopping')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
