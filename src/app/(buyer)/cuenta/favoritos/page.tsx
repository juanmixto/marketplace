import type { Metadata } from 'next'
import { requireAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { withFavoritesGuard } from '@/lib/favorites'
import { getServerT } from '@/i18n/server'
import { FavoritosClient } from './FavoritosClient'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT()
  return {
    title: `${t('favorites.title')} | Mercado Productor`,
    description: t('favorites.subtitle'),
  }
}

export default async function Favoritos() {
  const session = await requireAuth()
  const t = await getServerT()

  const [productResult, vendorResult] = await Promise.all([
    withFavoritesGuard(
      () =>
        db.favorite.findMany({
          where: { userId: session.user.id },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                images: true,
                basePrice: true,
                stock: true,
                vendor: {
                  select: {
                    displayName: true,
                    slug: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
      []
    ),
    withFavoritesGuard(
      () =>
        db.vendorFavorite.findMany({
          where: { userId: session.user.id },
          include: {
            vendor: {
              select: {
                id: true,
                slug: true,
                displayName: true,
                logo: true,
                coverImage: true,
                location: true,
                description: true,
                avgRating: true,
                totalReviews: true,
                _count: { select: { products: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
      []
    ),
  ])

  const unavailable = productResult.unavailable || vendorResult.unavailable

  return (
    <main className="space-y-6 max-w-4xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)]">{t('favorites.title')}</h1>
        <p className="mt-2 text-[var(--muted)]">
          {t('favorites.subtitle')}
        </p>
      </div>

      {unavailable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          {t('favorites.migrationWarning')}
        </div>
      )}

      <FavoritosClient
        initialFavorites={productResult.value}
        initialVendorFavorites={vendorResult.value}
      />
    </main>
  )
}
