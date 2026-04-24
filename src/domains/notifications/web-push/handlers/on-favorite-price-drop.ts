import { db } from '@/lib/db'
import type { FavoritePriceDropPayload } from '../../events'
import { sendWebPushToUser } from '../service'
import { favoritePriceDropPush } from '../templates'

/**
 * Web-push fan-out for price drops. Unlike the Telegram counterpart
 * we do not keep a cross-recipient cooldown here — the OS-level
 * notification `tag` dedupe collapses repeat pings on the same
 * device, and the Telegram handler already holds the authoritative
 * 24h cooldown that gates emission volume.
 */
export async function onFavoritePriceDrop(
  payload: FavoritePriceDropPayload,
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
  if (favourites.length === 0) return

  const payloadRef = `product:${payload.productId}:price_drop`
  for (const fav of favourites) {
    await sendWebPushToUser(
      fav.userId,
      'BUYER_FAVORITE_PRICE_DROP',
      favoritePriceDropPush(payload, {
        buyerFirstName: fav.user?.firstName ?? undefined,
        remainingStock: product?.stock ?? undefined,
      }),
      { payloadRef },
    )
  }
}
