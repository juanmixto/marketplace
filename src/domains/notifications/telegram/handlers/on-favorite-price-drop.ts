import { db } from '@/lib/db'
import type { FavoritePriceDropPayload } from '../../events'
import { sendToUser } from '../service'
import { favoritePriceDropTemplate } from '../templates'

/**
 * Fans out a price-drop notification to every user who has favourited
 * the product, *with a global 24h cooldown per product*. Without the
 * cooldown, a vendor tweaking price several times in a day would blast
 * each favouriter with a ping per tweak — and since the per-user rate
 * limit inside `sendToUser` does not coordinate across recipients, the
 * dedupe has to live here.
 */
const COOLDOWN_WINDOW_MS = 24 * 60 * 60 * 1000

export async function onFavoritePriceDrop(
  payload: FavoritePriceDropPayload,
): Promise<void> {
  const payloadRef = `product:${payload.productId}:price_drop`

  const recent = await db.notificationDelivery.findFirst({
    where: {
      eventType: 'BUYER_FAVORITE_PRICE_DROP',
      payloadRef,
      status: 'SENT',
      createdAt: { gte: new Date(Date.now() - COOLDOWN_WINDOW_MS) },
    },
    select: { id: true },
  })
  if (recent) {
    console.info('favorite.price_drop.skipped_cooldown', {
      productId: payload.productId,
    })
    return
  }

  const favourites = await db.favorite.findMany({
    where: { productId: payload.productId },
    select: { userId: true },
  })
  if (favourites.length === 0) return

  const message = favoritePriceDropTemplate(payload)
  for (const fav of favourites) {
    await sendToUser(fav.userId, 'BUYER_FAVORITE_PRICE_DROP', message, { payloadRef })
  }
}
