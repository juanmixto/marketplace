import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
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
  const [favourites, product] = await Promise.all([
    db.favorite.findMany({
      where: { productId: payload.productId },
      select: { userId: true, user: { select: { firstName: true } } },
    }),
    db.product.findUnique({
      where: { id: payload.productId },
      select: { stock: true },
    }),
  ])
  if (favourites.length === 0) {
    logger.warn('notifications.handler.skipped', {
      event: 'favorite.back_in_stock',
      reason: 'no_favorites',
      handler: 'telegram.on-favorite-restock',
      productId: payload.productId,
    })
    return
  }

  const payloadRef = `product:${payload.productId}:restock`

  for (const fav of favourites) {
    const message = favoriteBackInStockTemplate(payload, {
      buyerFirstName: fav.user?.firstName ?? undefined,
      remainingStock: product?.stock ?? undefined,
    })
    await sendToUser(fav.userId, 'BUYER_FAVORITE_RESTOCK', message, { payloadRef })
  }
}
