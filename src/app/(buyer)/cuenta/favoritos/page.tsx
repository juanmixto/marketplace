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

  const { value: favorites, unavailable } = await withFavoritesGuard(
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
  )

  return (
    <main className="space-y-6 max-w-3xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
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

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <FavoritosClient initialFavorites={favorites} />
      </div>
    </main>
  )
}
