'use server'

/**
 * Server-action wrappers over `cart-persistence.ts` (#270).
 *
 * The persistence layer takes `userId` directly because the domain
 * actions that already use it (checkout, admin ops) have it in scope.
 * The client, on the other hand, must not pass the id — it comes from
 * the session — so these wrappers resolve the session server-side and
 * reject any unauthenticated caller.
 *
 * Kept in a separate file so `cart-persistence.ts` stays a pure
 * domain module with no Next.js request-scope dependencies.
 */

import {
  clearServerCart,
  getServerCart,
  mergeLocalCartIntoServer,
  removeServerCartItem,
  setServerCartItem,
  type CartLineInput,
  type PersistedCartLine,
} from '@/domains/orders/cart-persistence'
import { getActionSession } from '@/lib/action-session'

/** Empty-array on anonymous callers — a non-auth UI can render nothing. */
export async function loadServerCart(): Promise<PersistedCartLine[]> {
  const session = await getActionSession()
  if (!session) return []
  return getServerCart(session.user.id)
}

export async function setCartItem(input: CartLineInput): Promise<void> {
  const session = await getActionSession()
  if (!session) return
  await setServerCartItem(session.user.id, input)
}

export async function removeCartItem(productId: string, variantId: string | null | undefined): Promise<void> {
  const session = await getActionSession()
  if (!session) return
  await removeServerCartItem(session.user.id, productId, variantId ?? undefined)
}

export async function clearMyServerCart(): Promise<void> {
  const session = await getActionSession()
  if (!session) return
  await clearServerCart(session.user.id)
}

/**
 * Called once on login: merge the caller's local-storage cart into
 * their server cart, return the combined state so the client can
 * replace its local copy. The server helper sums quantities on
 * overlapping (productId, variantId).
 */
export async function mergeLocalIntoServerCart(
  localItems: CartLineInput[],
): Promise<PersistedCartLine[]> {
  const session = await getActionSession()
  if (!session) return []
  return mergeLocalCartIntoServer(session.user.id, localItems)
}
