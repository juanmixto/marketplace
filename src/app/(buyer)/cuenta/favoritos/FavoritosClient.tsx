'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { HeartIcon } from '@heroicons/react/24/solid'
import { ShoppingCartIcon, TrashIcon } from '@heroicons/react/24/outline'

interface FavoriteProduct {
  id: string
  product: {
    id: string
    name: string
    slug: string
    images: string[]
    basePrice: any // Prisma Decimal type
    stock: number
    vendor: {
      displayName: string
      slug: string
    }
  }
  createdAt: string | Date
}

export function FavoritosClient({ initialFavorites }: { initialFavorites: FavoriteProduct[] }) {
  const [favorites, setFavorites] = useState<FavoriteProduct[]>(initialFavorites)
  const [loading, setLoading] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRemove = async (productId: string) => {
    try {
      setRemoving(productId)
      setError(null)

      const res = await fetch(`/api/favoritos/${productId}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Error al eliminar favorito')

      setFavorites(favorites.filter(f => f.product.id !== productId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar favorito')
    } finally {
      setRemoving(null)
    }
  }

  const handleAddToCart = (productId: string) => {
    // Implement cart adding later
    console.log('Add to cart:', productId)
  }

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <HeartIcon className="mb-4 h-16 w-16 text-[var(--muted)]" />
        <p className="mb-2 text-xl font-semibold text-[var(--foreground)]">
          Aún no tienes productos favoritos
        </p>
        <p className="mb-6 text-[var(--muted)]">
          Explora nuestro catálogo y añade tus productos preferidos
        </p>
        <Link
          href="/productos"
          className="rounded-lg bg-emerald-600 dark:bg-emerald-500 px-6 py-2 font-semibold text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition"
        >
          Explorar productos
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-4 text-red-800 dark:text-red-300">
          ✗ {error}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {favorites.map(fav => {
          const imageUrl = fav.product.images?.[0] || '/placeholder.jpg'
          // Handle Decimal price from Prisma
          const priceValue = fav.product.basePrice
          const priceString = typeof priceValue === 'object' && priceValue !== null
            ? String((priceValue as any).$numberDecimal || priceValue)
            : String(priceValue || '0.00')

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
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-[var(--muted)]">
                    Sin imagen
                  </div>
                )}
                <button
                  onClick={() => handleRemove(fav.product.id)}
                  disabled={removing === fav.product.id}
                  className="absolute right-2 top-2 rounded-full bg-[var(--surface)] dark:bg-[var(--surface-raised)] p-2 shadow-md hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition"
                  title="Quitar de favoritos"
                >
                  <HeartIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
                </button>
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
                    €{priceString}
                  </span>
                  {fav.product.stock > 0 ? (
                    <span className="text-xs text-[var(--muted)]">
                      ({fav.product.stock} disponibles)
                    </span>
                  ) : (
                    <span className="text-xs text-red-600 dark:text-red-400">Sin stock</span>
                  )}
                </div>

                <button
                  onClick={() => handleAddToCart(fav.product.id)}
                  disabled={fav.product.stock <= 0}
                  className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-emerald-600 dark:bg-emerald-500 px-4 py-2 font-semibold text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:bg-[var(--surface-raised)] disabled:text-[var(--muted)] disabled:cursor-not-allowed transition"
                >
                  <ShoppingCartIcon className="h-4 w-4" />
                  Añadir al carrito
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
