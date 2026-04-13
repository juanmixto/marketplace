'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useCartStore } from '@/lib/cart-store'
import { Button } from '@/components/ui/button'
import { SafeImage } from '@/components/catalog/SafeImage'
import { formatPrice } from '@/lib/utils'
import { TrashIcon, MinusIcon, PlusIcon, ShoppingBagIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { calculateShippingCost, type PublicMarketplaceSettings } from '@/lib/marketplace-settings'
import { useT } from '@/i18n'
import {
  getCartStockAvailability,
  type CartStockResultItem,
} from '@/domains/catalog/cart-stock-actions'

interface Props {
  shippingSettings: Pick<PublicMarketplaceSettings, 'FREE_SHIPPING_THRESHOLD' | 'FLAT_SHIPPING_COST'>
}

function itemKey(productId: string, variantId?: string) {
  return `${productId}::${variantId ?? ''}`
}

export function CartPageClient({ shippingSettings }: Props) {
  const { items, removeItem, updateQty, subtotal, clearCart, itemCount } = useCartStore()
  const t = useT()

  const [stockMap, setStockMap] = useState<Record<string, CartStockResultItem>>({})
  const [checkingStock, setCheckingStock] = useState(false)

  const stockSignature = useMemo(
    () => items.map(i => `${i.productId}|${i.variantId ?? ''}|${i.quantity}`).join(','),
    [items]
  )

  useEffect(() => {
    if (items.length === 0) {
      setStockMap({})
      return
    }

    let cancelled = false
    setCheckingStock(true)
    getCartStockAvailability(
      items.map(i => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity }))
    )
      .then(result => {
        if (cancelled) return
        const map: Record<string, CartStockResultItem> = {}
        for (const entry of result) {
          map[itemKey(entry.productId, entry.variantId)] = entry
        }
        setStockMap(map)
      })
      .catch(() => {
        if (cancelled) return
        setStockMap({})
      })
      .finally(() => {
        if (cancelled) return
        setCheckingStock(false)
      })

    return () => {
      cancelled = true
    }
  }, [stockSignature, items])

  const issuesCount = useMemo(
    () => Object.values(stockMap).filter(s => s.status !== 'OK').length,
    [stockMap]
  )
  const hasBlockingIssues = issuesCount > 0

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
        <div
          className="order-last space-y-3 lg:order-first lg:col-span-2"
          aria-busy={checkingStock || undefined}
        >
          {hasBlockingIssues && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
            >
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">{t('cart.stockBannerTitle')}</p>
                <p className="mt-0.5 text-amber-700 dark:text-amber-300/90">{t('cart.stockBannerDesc')}</p>
              </div>
            </div>
          )}

          {items.map(item => {
            const key = itemKey(item.productId, item.variantId)
            const stock = stockMap[key]
            const status = stock?.status ?? 'OK'
            const isUnavailable = status === 'UNAVAILABLE'
            const isInsufficient = status === 'INSUFFICIENT'
            const hasIssue = isUnavailable || isInsufficient
            const available = stock?.available ?? null

            return (
              <div key={key}
                className={`flex gap-4 rounded-xl border p-4 ${
                  hasIssue
                    ? 'border-amber-300 bg-amber-50/40 dark:border-amber-800/70 dark:bg-amber-950/15'
                    : 'border-[var(--border)] bg-[var(--surface)]'
                }`}
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

                  {hasIssue && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        <ExclamationTriangleIcon className="h-3 w-3" />
                        {isUnavailable ? t('cart.stockUnavailable') : t('cart.stockInsufficient')}
                      </span>
                      {isInsufficient && available !== null && (
                        <span className="text-[11px] text-amber-800 dark:text-amber-300">
                          {available === 1
                            ? t('cart.stockOnlyLeft_one')
                            : t('cart.stockOnlyLeft_other').replace('{count}', String(available))}
                        </span>
                      )}
                      {isInsufficient && available !== null && available > 0 && (
                        <button
                          type="button"
                          onClick={() => updateQty(item.productId, available, item.variantId)}
                          className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
                        >
                          {t('cart.stockAdjust')}
                        </button>
                      )}
                      {isUnavailable && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.productId, item.variantId)}
                          className="rounded-md border border-red-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/40"
                        >
                          {t('cart.clearCart')}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mt-1 flex items-center gap-3">
                    <div className={`flex items-center gap-1 rounded-lg border ${
                      hasIssue ? 'border-amber-300 dark:border-amber-700' : 'border-[var(--border)]'
                    }`}>
                      <button
                        type="button"
                        onClick={() => updateQty(item.productId, item.quantity - 1, item.variantId)}
                        aria-label={`Reducir cantidad de ${item.name}`}
                        // Disable when quantity===1 so the user can't accidentally
                        // remove the item by clicking minus repeatedly. The trash
                        // icon is the explicit removal affordance. Also disable
                        // during the stock check so the optimistic update doesn't
                        // race against the in-flight verification (#132).
                        disabled={item.quantity <= 1 || checkingStock}
                        className="rounded-l-lg p-1.5 transition hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <MinusIcon className="h-3.5 w-3.5 text-[var(--foreground-soft)]" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={available ?? undefined}
                        inputMode="numeric"
                        value={item.quantity}
                        disabled={checkingStock}
                        onChange={event => {
                          const nextQuantity = Number.parseInt(event.target.value, 10)
                          if (Number.isNaN(nextQuantity) || nextQuantity < 1) return
                          updateQty(item.productId, nextQuantity, item.variantId)
                        }}
                        className="w-12 bg-transparent text-center text-sm font-medium text-[var(--foreground)] focus:outline-none disabled:opacity-60"
                        aria-label={`Cantidad de ${item.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => updateQty(item.productId, item.quantity + 1, item.variantId)}
                        aria-label={`Aumentar cantidad de ${item.name}`}
                        disabled={checkingStock || (available !== null && item.quantity >= available)}
                        className="rounded-r-lg p-1.5 transition hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <PlusIcon className="h-3.5 w-3.5 text-[var(--foreground-soft)]" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId, item.variantId)}
                      aria-label={`Eliminar ${item.name} del carrito`}
                      disabled={checkingStock}
                      className="text-[var(--muted)] transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-red-400"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-[var(--foreground)]">{formatPrice(item.price * item.quantity)}</p>
                </div>
              </div>
            )
          })}
          <button
            type="button"
            onClick={clearCart}
            aria-label={t('cart.clearCart')}
            disabled={checkingStock}
            className="mt-2 text-sm text-[var(--muted)] transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-red-400"
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
            {hasBlockingIssues ? (
              <>
                <Button className="mt-4 w-full" size="lg" disabled>
                  {t('cart.toCheckout')}
                </Button>
                <p className="mt-2 text-center text-xs text-amber-700 dark:text-amber-300">
                  {t('cart.stockCheckoutBlocked')}
                </p>
              </>
            ) : (
              <Link href="/checkout">
                <Button className="mt-4 w-full" size="lg">{t('cart.toCheckout')}</Button>
              </Link>
            )}
            {checkingStock && (
              <p className="mt-2 text-center text-xs text-[var(--muted)]">{t('cart.stockChecking')}</p>
            )}
            <Link href="/productos" className="mt-3 block text-center text-sm text-[var(--muted)] hover:text-emerald-600 dark:hover:text-emerald-400">
              {t('cart.continueShopping')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
