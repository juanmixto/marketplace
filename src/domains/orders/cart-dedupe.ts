import { createHash } from 'node:crypto'

/**
 * Deterministic fingerprint of a cart payload used by the
 * checkoutAttemptId dedupe path in `createOrder`.
 *
 * Two calls with the same logical cart (same products + variants +
 * quantities, regardless of input order or duplicate-row shape) must
 * hash to the same value. Any change to items, quantities, or variants
 * must produce a different hash.
 *
 * Server-only: lives outside `actions.ts` so it can be unit-tested
 * without the 'use server' barrier, and outside `checkout.ts` so the
 * browser bundle never pulls in `node:crypto`.
 */
export type DedupeCartItem = {
  productId: string
  variantId?: string | null
  quantity: number
}

export function hashCartForDedupe(items: ReadonlyArray<DedupeCartItem>): string {
  if (items.length === 0) return 'empty'

  // Group by (productId, variantId) in case the same line appears
  // multiple times with the same variant. Summing quantities matches
  // the downstream order-line semantics (one row per variant).
  const normalised = items.reduce<Map<string, number>>((acc, item) => {
    const key = `${item.productId}|${item.variantId ?? ''}`
    acc.set(key, (acc.get(key) ?? 0) + item.quantity)
    return acc
  }, new Map())

  const serialised = Array.from(normalised.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, quantity]) => `${key}:${quantity}`)
    .join(',')

  return createHash('sha256').update(serialised).digest('hex')
}
