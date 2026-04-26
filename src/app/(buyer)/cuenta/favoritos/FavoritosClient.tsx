'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { HeartIcon } from '@heroicons/react/24/solid'
import { ShoppingCartIcon } from '@heroicons/react/24/outline'
import { useT } from '@/i18n'
import { useCartStore } from '@/domains/cart/cart-store'
import { useFavoritesStore } from '@/domains/catalog/favorites-store'
import { OutOfStockOverlay } from '@/components/catalog/OutOfStockOverlay'
import type { FavoriteProductItem } from '@/lib/favorites-serialization'
import { formatPrice } from '@/lib/utils'

export function FavoritosClient({ initialFavorites }: { initialFavorites: FavoriteProductItem[] }) {
  const t = useT()
  const addItem = useCartStore(s => s.addItem)
  const storeFavRemove = useFavoritesStore(s => s.remove)
  const [favorites, setFavorites] = useState<FavoriteProductItem[]>(initialFavorites)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRemove = async (productId: string) => {
    try {
      setRemoving(productId)
      setError(null)

      const res = await fetch(`/api/favoritos/${productId}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error(t('favorites.errorRemove'))

      setFavorites(favorites.filter(f => f.product.id !== productId))
      storeFavRemove(productId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('favorites.errorRemove'))
    } finally {
      setRemoving(null)
    }
  }

  const handleAddToCart = (fav: FavoriteProductItem) => {
    addItem({
      productId: fav.product.id,
      name: fav.product.name,
      slug: fav.product.slug,
      image: fav.product.images?.[0],
      price: fav.product.basePrice,
      unit: 'ud',
      vendorId: '',
      vendorName: fav.product.vendor.displayName,
    })
  }

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <HeartIcon className="mb-4 h-16 w-16 text-[var(--muted)]" />
        <p className="mb-2 text-xl font-semibold text-[var(--foreground)]">
          {t('favorites.emptyTitle')}
        </p>
        <p className="mb-6 text-[var(--muted)]">
          {t('favorites.emptyBody')}
        </p>
        <Link
          href="/productos"
          className="rounded-lg bg-emerald-600 dark:bg-emerald-500 px-6 py-2 font-semibold text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition"
        >
          {t('favorites.explore')}
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-4 text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {favorites.map(fav => {
          const imageUrl = fav.product.images?.[0] || ''

          return (
            <div
              key={fav.product.id}
              className="flex flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:shadow-lg dark:hover:shadow-lg/50 transition-shadow"
            >
              {/* Image */}
              <div className="relative h-48 w-full bg-[var(--surface-raised)]">
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={fav.product.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-[var(--muted)]">
                    {t('favorites.noImage')}
                  </div>
                )}
                <button
                  onClick={() => handleRemove(fav.product.id)}
                  disabled={removing === fav.product.id}
                  className="absolute right-2 top-2 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[var(--surface)] p-2.5 shadow-md transition hover:bg-red-50 disabled:opacity-50 dark:bg-[var(--surface-raised)] dark:hover:bg-red-950/30"
                  title={t('favorites.removeTitle')}
                  aria-label={t('favorites.removeTitle')}
                >
                  <HeartIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
                </button>
                {fav.product.stock <= 0 && (
                  <OutOfStockOverlay label={t('favorites.outOfStock')} />
                )}
              </div>

              {/* Details */}
              <div className="flex flex-1 flex-col p-4">
                <Link
                  href={`/productos/${fav.product.slug}`}
                  className="mb-1 line-clamp-2 font-semibold text-[var(--foreground)] hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  {fav.product.name}
                </Link>

                <Link
                  href={`/productores/${fav.product.vendor.slug}`}
                  className="mb-3 text-xs text-[var(--muted)] hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  {fav.product.vendor.displayName}
                </Link>

                <div className="mb-3 flex items-baseline gap-2">
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {formatPrice(fav.product.basePrice)}
                  </span>
                  {fav.product.stock > 0 && (
                    <span className="text-xs text-[var(--muted)]">
                      ({fav.product.stock} {t('favorites.available')})
                    </span>
                  )}
                </div>

                <button
                  onClick={() => handleAddToCart(fav)}
                  disabled={fav.product.stock <= 0}
                  className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-emerald-600 dark:bg-emerald-500 px-4 py-2 font-semibold text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:bg-[var(--surface-raised)] disabled:text-[var(--muted)] disabled:cursor-not-allowed transition"
                >
                  <ShoppingCartIcon className="h-4 w-4" />
                  {t('favorites.addToCart')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
