import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { FavoriteBackInStockPayload } from '../../events'
import { sendWebPushToUser } from '../service'
import { favoriteBackInStockPush } from '../templates'

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
      handler: 'web-push.on-favorite-restock',
      productId: payload.productId,
    })
    return
  }

  const payloadRef = `product:${payload.productId}:restock`
  for (const fav of favourites) {
    await sendWebPushToUser(
      fav.userId,
      'BUYER_FAVORITE_RESTOCK',
      favoriteBackInStockPush(payload, {
        buyerFirstName: fav.user?.firstName ?? undefined,
        remainingStock: product?.stock ?? undefined,
      }),
      { payloadRef },
    )
  }
}
