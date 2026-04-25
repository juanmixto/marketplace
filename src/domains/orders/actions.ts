'use server'

import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { createOrder } from './use-cases/create-order'
import { createCheckoutOrder } from './use-cases/create-checkout-order'
import { confirmOrder } from './use-cases/confirm-order'

export type { CartItemInput } from '@/shared/types/cart'
export type { CreateCheckoutOrderResult } from './use-cases/create-checkout-order'
export type { CreateOrderResult } from './use-cases/create-order'
export { createOrder, createCheckoutOrder, confirmOrder }

export async function getMyOrders() {
  const session = await getActionSession()
  if (!session) return []

  return db.order.findMany({
    where: { customerId: session.user.id },
    orderBy: { placedAt: 'desc' },
    include: {
      lines: {
        include: { product: { select: { name: true, images: true, slug: true } } },
      },
      reviews: { select: { productId: true } },
    },
  })
}

export async function getOrderDetail(orderId: string) {
  const session = await getActionSession()
  if (!session) return null

  return db.order.findFirst({
    where: { id: orderId, customerId: session.user.id },
    include: {
      lines: {
        include: { product: { select: { name: true, images: true, slug: true, unit: true } } },
      },
      address: true,
      payments: true,
      fulfillments: {
        include: {
          vendor: { select: { displayName: true } },
          shipment: {
            select: {
              status: true,
              carrierName: true,
              trackingNumber: true,
              trackingUrl: true,
            },
          },
        },
      },
    },
  })
}
