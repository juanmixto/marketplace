'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { HeartIcon } from '@heroicons/react/24/solid'
import { useT, useLocale } from '@/i18n'
import { useFavoritesStore } from '@/domains/catalog/favorites-store'
import { OutOfStockOverlay } from '@/components/catalog/OutOfStockOverlay'
import { FavoriteToggleButton } from '@/components/catalog/FavoriteToggleButton'
import { AddToCartButton } from '@/components/catalog/AddToCartButton'
import { getCatalogCopy } from '@/i18n/catalog-copy'
import type { FavoriteProductItem } from '@/lib/favorites-serialization'
import { formatPrice } from '@/lib/utils'

export function FavoritosClient({ initialFavorites }: { initialFavorites: FavoriteProductItem[] }) {
  const t = useT()
  const { locale } = useLocale()
  const catalogCopy = getCatalogCopy(locale)
  const storeProductIds = useFavoritesStore(s => s.productIds)
  const [favorites, setFavorites] = useState<FavoriteProductItem[]>(initialFavorites)

  // The shared FavoriteToggleButton dispatches to useFavoritesStore.
  // When a buyer un-favorites an item from this page, the store loses
  // the id; reflect that in the local list so the card disappears
  // without us owning a parallel remove-mutation path. We only filter
  // out (never add) so initialFavorites' richer shape — name, vendor,
  // images, stock — stays the source of truth for items still listed.
  useEffect(() => {
    setFavorites(prev => prev.filter(f => storeProductIds.has(f.product.id)))
  }, [storeProductIds])

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
                {/* Reuse the catalog overlay variant so /productos and
                    /cuenta/favoritos render the same heart-on-image
                    treatment. The component dispatches to the favorites
                    store; the local list filters itself once the store
                    confirms removal (see useEffect below). */}
                <div className="absolute right-2 top-2 z-10">
                  <FavoriteToggleButton
                    productId={fav.product.id}
                    productName={fav.product.name}
                    variant="overlay"
                  />
                </div>
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

                <div className="mt-auto">
                  <AddToCartButton
                    productId={fav.product.id}
                    productName={fav.product.name}
                    disabled={fav.product.stock <= 0}
                    disabledLabel={catalogCopy.actions.outOfStock}
                    price={fav.product.basePrice}
                    slug={fav.product.slug}
                    image={fav.product.images?.[0]}
                    vendorName={fav.product.vendor.displayName}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
