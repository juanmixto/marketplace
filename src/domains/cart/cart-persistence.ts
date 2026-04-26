'use server'

/**
 * Server-side cart persistence (#90).
 *
 * Layer 1 (localStorage) is handled by the Zustand `persist` middleware in
 * `cart-store.ts`. This module is layer 2: a per-user `Cart` row in the
 * database that survives across devices and browsers.
 *
 * Design notes:
 *
 * - Mutations are individually upserted/deleted, no whole-cart replace, so
 *   concurrent activity from a second tab can't clobber an earlier write.
 * - Merging a local cart into the server cart sums quantities by
 *   (productId, variantId) — this matches the unique constraint on
 *   `CartItem` and keeps the rule "the same product + variant is one row
 *   with a quantity, never two rows".
 * - All functions take `userId` rather than reading the session themselves
 *   so the callers (server actions, route handlers) keep auth in one place
 *   and tests can exercise the logic without mocking auth-config.
 */

import { db } from '@/lib/db'

export interface CartLineInput {
  productId: string
  variantId?: string | null
  quantity: number
}

export interface PersistedCartLine {
  id: string
  productId: string
  variantId: string | null
  quantity: number
  product: {
    id: string
    name: string
    slug: string
    images: string[]
    basePrice: number
    unit: string
    vendor: { id: string; slug: string; displayName: string }
  }
  variant: {
    id: string
    name: string
    priceModifier: number
  } | null
}

function normalizeQuantity(raw: number): number {
  if (!Number.isFinite(raw)) return 0
  const n = Math.floor(raw)
  return n > 0 ? n : 0
}

async function ensureCart(userId: string) {
  return db.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  })
}

/**
 * Read the authenticated user's persisted cart, joined with current product
 * and variant data so the client can render it directly without a second
 * trip. Returns an empty array (not null) when the user has no cart yet.
 */
export async function getServerCart(userId: string): Promise<PersistedCartLine[]> {
  const cart = await db.cart.findUnique({
    where: { userId },
    select: {
      items: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          productId: true,
          variantId: true,
          quantity: true,
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              images: true,
              basePrice: true,
              unit: true,
              vendor: { select: { id: true, slug: true, displayName: true } },
            },
          },
          variant: {
            select: { id: true, name: true, priceModifier: true },
          },
        },
      },
    },
  })

  if (!cart) return []

  return cart.items.map(item => ({
    id: item.id,
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
    product: {
      id: item.product.id,
      name: item.product.name,
      slug: item.product.slug,
      images: item.product.images,
      basePrice: Number(item.product.basePrice),
      unit: item.product.unit,
      vendor: item.product.vendor,
    },
    variant: item.variant
      ? {
          id: item.variant.id,
          name: item.variant.name,
          priceModifier: Number(item.variant.priceModifier),
        }
      : null,
  }))
}

/**
 * Add or replace a single line in the persisted cart. If the same
 * (productId, variantId) pair already exists, the quantity is **set**
 * to the incoming value (not incremented) so the client stays in sync
 * with what the user sees on screen.
 *
 * Note: the @@unique([cartId, productId, variantId]) constraint on
 * CartItem can't be used directly via Prisma's composite-key where input
 * because variantId is nullable. We do a find-then-write instead. The
 * unique constraint still defends against races at the DB level.
 */
export async function setServerCartItem(
  userId: string,
  input: CartLineInput
): Promise<void> {
  const quantity = normalizeQuantity(input.quantity)
  if (quantity === 0) {
    await removeServerCartItem(userId, input.productId, input.variantId)
    return
  }

  const cart = await ensureCart(userId)
  const existing = await db.cartItem.findFirst({
    where: {
      cartId: cart.id,
      productId: input.productId,
      variantId: input.variantId ?? null,
    },
    select: { id: true },
  })

  if (existing) {
    await db.cartItem.update({
      where: { id: existing.id },
      data: { quantity },
    })
    return
  }

  await db.cartItem.create({
    data: {
      cartId: cart.id,
      userId,
      productId: input.productId,
      variantId: input.variantId ?? null,
      quantity,
    },
  })
}

/**
 * Remove a single line. No-op if the line doesn't exist (matches the
 * client store's idempotent removeItem behavior).
 */
export async function removeServerCartItem(
  userId: string,
  productId: string,
  variantId?: string | null
): Promise<void> {
  const cart = await db.cart.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!cart) return

  await db.cartItem.deleteMany({
    where: {
      cartId: cart.id,
      productId,
      variantId: variantId ?? null,
    },
  })
}

/**
 * Empty the persisted cart. Called after a successful order placement
 * so the user's next visit doesn't resurrect items they just bought.
 */
export async function clearServerCart(userId: string): Promise<void> {
  const cart = await db.cart.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!cart) return
  await db.cartItem.deleteMany({ where: { cartId: cart.id } })
}

/**
 * Merge a local (anonymous) cart into the user's persisted cart on login.
 *
 * Rule: for each local line, **sum** its quantity into the matching
 * (productId, variantId) line on the server. If no matching line exists,
 * create it. This is the standard "anonymous cart survives login" UX —
 * the user keeps everything they had before signing in, plus everything
 * they had on the server from a previous session.
 *
 * The function returns the merged cart so the client can hydrate the
 * Zustand store directly without a second `getServerCart` call.
 */
export async function mergeLocalCartIntoServer(
  userId: string,
  localItems: CartLineInput[]
): Promise<PersistedCartLine[]> {
  if (localItems.length === 0) {
    return getServerCart(userId)
  }

  const cart = await ensureCart(userId)

  // Collapse duplicates within the local payload before hitting the DB,
  // so a malformed client that sent the same line twice doesn't double-add.
  const collapsed = new Map<string, CartLineInput>()
  for (const item of localItems) {
    const key = `${item.productId}::${item.variantId ?? ''}`
    const existing = collapsed.get(key)
    const quantity = normalizeQuantity(item.quantity) + normalizeQuantity(existing?.quantity ?? 0)
    if (quantity > 0) {
      collapsed.set(key, {
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity,
      })
    }
  }

  // Same nullable-composite-key workaround as setServerCartItem: find then
  // update-or-create. We run the whole batch in a single $transaction so
  // a partial merge can't leave the cart in a half-state if any single
  // line fails.
  await db.$transaction(async tx => {
    for (const item of collapsed.values()) {
      const quantityToAdd = normalizeQuantity(item.quantity)
      if (quantityToAdd === 0) continue

      const existing = await tx.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId: item.productId,
          variantId: item.variantId ?? null,
        },
        select: { id: true, quantity: true },
      })

      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + quantityToAdd },
        })
      } else {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            userId,
            productId: item.productId,
            variantId: item.variantId ?? null,
            quantity: quantityToAdd,
          },
        })
      }
    }
  })

  return getServerCart(userId)
}
