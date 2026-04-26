'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useCartStore, type CartItem } from '@/domains/cart/cart-store'
import {
  loadServerCart,
  mergeLocalIntoServerCart,
} from '@/domains/cart'
import { installCartBroadcast } from '@/domains/cart/cart-broadcast'
import {
  getCartHydrationAction,
} from './cart-hydration-plan'
import { CART_MERGED_FLAG_KEY } from './cart-session'

/**
 * On login, merges the anonymous local-storage cart into the buyer's
 * server cart and replaces the client state with the union (#270).
 *
 * Strategy:
 *   1. Wait for NextAuth session to become `authenticated`.
 *   2. If the device has not yet merged for this user, snapshot the
 *      anonymous cart and call `mergeLocalIntoServerCart(local)`.
 *   3. Otherwise just `loadServerCart()`. The merged-user flag keeps
 *      repeated reloads from replaying the same synchronized cart and
 *      doubling server quantities.
 *   4. Sign-out handlers clear the local cart and merge flag so the
 *      next anonymous shopping session starts cleanly.
 */
export function CartHydrationProvider() {
  const { data, status } = useSession()
  const hasHydratedRef = useRef<string | null>(null)

  // #795: cross-tab cart sync. Mount once for the lifetime of the
  // provider — installCartBroadcast is idempotent and gracefully
  // no-ops in browsers without BroadcastChannel.
  useEffect(() => {
    return installCartBroadcast()
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') {
      hasHydratedRef.current = null
      return
    }
    const userId = data?.user?.id
    if (!userId) return
    if (hasHydratedRef.current === userId) return
    hasHydratedRef.current = userId

    void (async () => {
      try {
        const state = useCartStore.getState()
        const alreadyMerged =
          typeof window !== 'undefined' &&
          window.localStorage.getItem(CART_MERGED_FLAG_KEY) === userId

        const action = getCartHydrationAction({
          status,
          userId,
          alreadyMergedForUser: alreadyMerged,
          localItemCount: state.items.length,
        })

        const merged =
          action === 'merge'
            ? await mergeLocalIntoServerCart(
                state.items.map(item => ({
                  productId: item.productId,
                  variantId: item.variantId ?? undefined,
                  quantity: item.quantity,
                })),
              )
            : await loadServerCart()

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(CART_MERGED_FLAG_KEY, userId)
        }

        const hydrated: CartItem[] = merged.map(line => ({
          productId: line.productId,
          variantId: line.variantId ?? undefined,
          name: line.product.name,
          slug: line.product.slug,
          image: line.product.images[0],
          price:
            Number(line.product.basePrice) + (line.variant ? Number(line.variant.priceModifier) : 0),
          unit: line.product.unit,
          vendorId: line.product.vendor.id,
          vendorName: line.product.vendor.displayName,
          quantity: line.quantity,
          ...(line.variant?.name && { variantName: line.variant.name }),
        }))

        useCartStore.setState({ items: hydrated })
      } catch {
        // Network / server error — leave local cart as is. Next page
        // load or navigation will retry via the same effect.
        hasHydratedRef.current = null
      }
    })()
  }, [data?.user?.id, status])

  return null
}
