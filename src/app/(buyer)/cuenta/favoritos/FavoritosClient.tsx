'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { HeartIcon } from '@heroicons/react/24/solid'
import { ShoppingCartIcon, MapPinIcon, StarIcon } from '@heroicons/react/24/outline'
import { useT } from '@/i18n'
import { useCartStore } from '@/lib/cart-store'
import { useFavoritesStore } from '@/lib/favorites-store'
import { cn } from '@/lib/utils'
import { getVendorHeroImage } from '@/lib/vendor-visuals'

interface FavoriteProduct {
  id: string
  product: {
    id: string
    name: string
    slug: string
    images: string[]
    basePrice: any
    stock: number
    vendor: {
      displayName: string
      slug: string
    }
  }
  createdAt: string | Date
}

interface FavoriteVendor {
  id: string
  vendor: {
    id: string
    slug: string
    displayName: string
    logo: string | null
    coverImage: string | null
    location: string | null
    description: string | null
    avgRating: any
    totalReviews: number
    _count: { products: number }
  }
  createdAt: string | Date
}

type Tab = 'products' | 'producers'

export function FavoritosClient({
  initialFavorites,
  initialVendorFavorites,
}: {
  initialFavorites: FavoriteProduct[]
  initialVendorFavorites: FavoriteVendor[]
}) {
  const t = useT()
  const addItem = useCartStore(s => s.addItem)
  const storeFavRemove = useFavoritesStore(s => s.remove)
  const storeVendorRemove = useFavoritesStore(s => s.removeVendor)
  const [favorites, setFavorites] = useState<FavoriteProduct[]>(initialFavorites)
  const [vendorFavorites, setVendorFavorites] = useState<FavoriteVendor[]>(initialVendorFavorites)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('products')

  const handleRemoveProduct = async (productId: string) => {
    try {
      setRemoving(productId)
      setError(null)
      const res = await fetch(`/api/favoritos/${productId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(t('favorites.errorRemove'))
      setFavorites(favorites.filter(f => f.product.id !== productId))
      storeFavRemove(productId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('favorites.errorRemove'))
    } finally {
      setRemoving(null)
    }
  }

  const handleRemoveVendor = async (vendorId: string) => {
    try {
      setRemoving(vendorId)
      setError(null)
      const res = await fetch(`/api/favoritos/vendors/${vendorId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(t('favorites.errorRemove'))
      setVendorFavorites(vendorFavorites.filter(f => f.vendor.id !== vendorId))
      storeVendorRemove(vendorId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('favorites.errorRemove'))
    } finally {
      setRemoving(null)
    }
  }

  const handleAddToCart = (fav: FavoriteProduct) => {
    const price = typeof fav.product.basePrice === 'object' && fav.product.basePrice !== null
      ? Number(String((fav.product.basePrice as any).$numberDecimal || fav.product.basePrice))
      : Number(fav.product.basePrice || 0)

    addItem({
      productId: fav.product.id,
      name: fav.product.name,
      slug: fav.product.slug,
      image: fav.product.images?.[0],
      price,
      unit: 'ud',
      vendorId: '',
      vendorName: fav.product.vendor.displayName,
    })
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-[var(--surface-raised)] p-1">
        <button
          onClick={() => setActiveTab('products')}
          className={cn(
            'flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition',
            activeTab === 'products'
              ? 'bg-[var(--surface)] text-[var(--foreground)] shadow-sm'
              : 'text-[var(--muted)] hover:text-[var(--foreground)]'
          )}
        >
          {t('favorites.tabProducts')}
          {favorites.length > 0 && (
            <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-100 px-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {favorites.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('producers')}
          className={cn(
            'flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition',
            activeTab === 'producers'
              ? 'bg-[var(--surface)] text-[var(--foreground)] shadow-sm'
              : 'text-[var(--muted)] hover:text-[var(--foreground)]'
          )}
        >
          {t('favorites.tabProducers')}
          {vendorFavorites.length > 0 && (
            <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-100 px-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {vendorFavorites.length}
            </span>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-4 text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Products tab */}
      {activeTab === 'products' && (
        favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm">
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
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {favorites.map(fav => {
              const imageUrl = fav.product.images?.[0] || ''
              const priceValue = fav.product.basePrice
              const priceString = typeof priceValue === 'object' && priceValue !== null
                ? String((priceValue as any).$numberDecimal || priceValue)
                : String(priceValue || '0.00')

              return (
                <div
                  key={fav.product.id}
                  className="flex flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:shadow-lg dark:hover:shadow-lg/50 transition-shadow"
                >
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
                      onClick={() => handleRemoveProduct(fav.product.id)}
                      disabled={removing === fav.product.id}
                      className="absolute right-2 top-2 rounded-full bg-[var(--surface)] dark:bg-[var(--surface-raised)] p-2 shadow-md hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition"
                      title={t('favorites.removeTitle')}
                    >
                      <HeartIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </button>
                  </div>

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
                        {priceString} &euro;
                      </span>
                      {fav.product.stock > 0 ? (
                        <span className="text-xs text-[var(--muted)]">
                          ({fav.product.stock} {t('favorites.available')})
                        </span>
                      ) : (
                        <span className="text-xs text-red-600 dark:text-red-400">{t('favorites.outOfStock')}</span>
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
        )
      )}

      {/* Producers tab */}
      {activeTab === 'producers' && (
        vendorFavorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm">
            <HeartIcon className="mb-4 h-16 w-16 text-[var(--muted)]" />
            <p className="mb-2 text-xl font-semibold text-[var(--foreground)]">
              {t('favorites.emptyVendorsTitle')}
            </p>
            <p className="mb-6 text-[var(--muted)]">
              {t('favorites.emptyVendorsBody')}
            </p>
            <Link
              href="/productores"
              className="rounded-lg bg-emerald-600 dark:bg-emerald-500 px-6 py-2 font-semibold text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition"
            >
              {t('favorites.exploreProducers')}
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {vendorFavorites.map(fav => {
              const v = fav.vendor
              const heroImage = v.coverImage || getVendorHeroImage(v as any)

              return (
                <div
                  key={v.id}
                  className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm transition-all hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700"
                >
                  <div className="relative h-36 bg-[var(--surface-raised)]">
                    <Image
                      src={heroImage}
                      alt={v.displayName}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                    <button
                      onClick={() => handleRemoveVendor(v.id)}
                      disabled={removing === v.id}
                      className="absolute right-2 top-2 rounded-full bg-white/80 dark:bg-black/50 p-2 shadow-md hover:bg-red-50 dark:hover:bg-red-950/30 backdrop-blur-sm disabled:opacity-50 transition"
                      title={t('favorites.removeTitle')}
                    >
                      <HeartIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </button>

                    <div className="absolute bottom-3 left-3 right-3">
                      <p className="text-lg font-bold text-white drop-shadow-md truncate">
                        {v.displayName}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
                      {v.location && (
                        <span className="flex items-center gap-1">
                          <MapPinIcon className="h-3.5 w-3.5" /> {v.location}
                        </span>
                      )}
                      {v.avgRating && (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <StarIcon className="h-3.5 w-3.5" />
                          {Number(v.avgRating).toFixed(1)}
                          <span className="text-[var(--muted)]">({v.totalReviews})</span>
                        </span>
                      )}
                      <span className="text-xs">
                        {v._count.products} {t('favorites.vendorProducts')}
                      </span>
                    </div>

                    {v.description && (
                      <p className="line-clamp-2 text-sm text-[var(--foreground-soft)]">{v.description}</p>
                    )}

                    <Link
                      href={`/productores/${v.slug}`}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                      {t('favorites.viewProducer')} <span aria-hidden>→</span>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
