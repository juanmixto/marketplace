import { Metadata } from 'next'
import { requireAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { FavoritosClient } from './FavoritosClient'

export const metadata: Metadata = {
  title: 'Mis Favoritos | Mercado Productor',
  description: 'Gestiona tu lista de productos favoritos',
}

export default async function Favoritos() {
  const session = await requireAuth()

  const favorites = await db.favorite.findMany({
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
  })

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Mis favoritos</h1>
        <p className="mt-2 text-gray-600">
          Productos que has marcado como favoritos
        </p>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <FavoritosClient initialFavorites={favorites} />
      </div>
    </main>
  )
}
