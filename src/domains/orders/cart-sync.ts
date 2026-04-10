'use server'

import { getActionSession } from '@/lib/action-session'
import type { CartItem } from '@/lib/cart-store'

export interface CartSyncItem {
  productId: string
  variantId?: string
  quantity: number
}

/**
 * Persists local cart items to the DB cart for the authenticated user.
 * Existing items with matching (productId, variantId) have their quantities
 * incremented; new items are inserted.
 *
 * Call this after login to merge the guest cart into the authenticated cart.
 */
export async function syncCartToDB(items: CartSyncItem[]): Promise<void> {
  const session = await getActionSession()
  if (!session || items.length === 0) return

  const { db } = await import('@/lib/db')

  const userId = session.user.id

  const cart = await db.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
  })

  for (const item of items) {
    await db.cartItem.upsert({
      where: {
        cartId_productId_variantId: {
          cartId: cart.id,
          productId: item.productId,
          variantId: item.variantId ?? null,
        },
      },
      create: {
        cartId: cart.id,
        userId,
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity: item.quantity,
      },
      update: {
        quantity: { increment: item.quantity },
      },
    })
  }
}

/**
 * Loads the authenticated user's DB cart with full product info for the Zustand store.
 * Returns an empty array for unauthenticated users.
 */
export async function loadCartFromDB(): Promise<CartItem[]> {
  const session = await getActionSession()
  if (!session) return []

  const { db } = await import('@/lib/db')

  const cart = await db.cart.findUnique({
    where: { userId: session.user.id },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              images: true,
              basePrice: true,
              unit: true,
              vendor: { select: { id: true, displayName: true } },
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

  return cart.items
    .filter(i => i.product && i.product.vendor)
    .map(i => {
      const product = i.product!
      const variant = i.variant ?? null
      const basePrice = Number(product.basePrice)
      const price = variant ? basePrice + Number(variant.priceModifier) : basePrice

      return {
        productId: product.id,
        variantId: variant?.id,
        variantName: variant?.name ?? undefined,
        name: product.name,
        slug: product.slug,
        image: product.images?.[0] ?? undefined,
        price,
        unit: product.unit,
        vendorId: product.vendor!.id,
        vendorName: product.vendor!.displayName,
        quantity: i.quantity,
      } satisfies CartItem
    })
}

/**
 * Clears the authenticated user's DB cart (e.g., after a successful order).
 */
export async function clearDBCart(): Promise<void> {
  const session = await getActionSession()
  if (!session) return

  const { db } = await import('@/lib/db')

  await db.cartItem.deleteMany({
    where: { userId: session.user.id },
  })
}

