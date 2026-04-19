'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useCartStore, type CartItem } from '@/domains/orders/cart-store'
import { loadServerCart, mergeLocalIntoServerCart } from '@/domains/orders/cart-actions'

/**
 * On login, merges the anonymous local-storage cart into the buyer's
 * server cart and replaces the client state with the union (#270).
 *
 * Strategy:
 *   1. Wait for NextAuth session to become `authenticated`.
 *   2. Snapshot whatever is in local storage (items the buyer added
 *      while anonymous).
 *   3. Call `mergeLocalIntoServerCart(local)` — the helper sums
 *      quantities on overlapping (productId, variantId) and returns
 *      the combined server state.
 *   4. Hydrate the Zustand store from the server response so all
 *      tabs / devices converge on the same cart. No-op if the merge
 *      fails — keep the local cart untouched to avoid losing items.
 *
 * Runs exactly once per session. Logouts are handled by Zustand's
 * persist middleware (keeps local storage intact) and the next login
 * replays the merge from whatever state the user accumulated.
 */
export function CartHydrationProvider() {
  const { data, status } = useSession()
  const hasHydratedRef = useRef<string | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') return
    const userId = data?.user?.id
    if (!userId) return
    if (hasHydratedRef.current === userId) return
    hasHydratedRef.current = userId

    const state = useCartStore.getState()
    const localItems = state.items.map(item => ({
      productId: item.productId,
      variantId: item.variantId ?? undefined,
      quantity: item.quantity,
    }))

    void (async () => {
      try {
        const merged = localItems.length > 0
          ? await mergeLocalIntoServerCart(localItems)
          : await loadServerCart()

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
