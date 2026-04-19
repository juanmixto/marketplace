import { db } from '@/lib/db'
import type { FavoriteBackInStockPayload } from '../../events'
import { sendToUser } from '../service'
import { favoriteBackInStockTemplate } from '../templates'

/**
 * Fans out a back-in-stock notification to every user who has
 * favourited the product. Per-user rate limiting + preferences lookup
 * live inside `sendToUser`, so each recipient is independently opted
 * in/out. `payloadRef` is stable per product so the delivery log is
 * greppable.
 */
export async function onFavoriteBackInStock(
  payload: FavoriteBackInStockPayload,
): Promise<void> {
  const favourites = await db.favorite.findMany({
    where: { productId: payload.productId },
    select: { userId: true },
  })
  if (favourites.length === 0) return

  const message = favoriteBackInStockTemplate(payload)
  const payloadRef = `product:${payload.productId}:restock`

  for (const fav of favourites) {
    await sendToUser(fav.userId, 'BUYER_FAVORITE_RESTOCK', message, { payloadRef })
  }
}
