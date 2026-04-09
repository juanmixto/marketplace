'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { generateOrderNumber } from '@/lib/utils'
import { createPaymentIntent } from '@/domains/payments/provider'
import { revalidatePath } from 'next/cache'
import { calculateOrderPricing, calculateOrderTotalsWithShippingCost, checkoutSchema, type CheckoutFormData } from '@/domains/orders/checkout'
import { shouldApplyPaymentSucceeded } from '@/domains/payments/webhook'
import { getServerEnv } from '@/lib/env'
import { getAvailableProductWhere } from '@/domains/catalog/availability'
import { getShippingCost } from '@/domains/shipping/calculator'

export interface CartItemInput {
  productId: string
  variantId?: string
  quantity: number
}

/**
 * Creates an order from the current cart items.
 * Returns a client secret for Stripe (or mock token) to complete payment.
 */
export async function createOrder(
  items: CartItemInput[],
  formData: CheckoutFormData
): Promise<{ orderId: string; clientSecret: string; orderNumber: string }> {
  const session = await auth()
  if (!session) redirect('/login')

  const validated = checkoutSchema.parse(formData)

  // Load products with current prices
  const products = await db.product.findMany({
    where: { id: { in: items.map(i => i.productId) }, ...getAvailableProductWhere() },
    include: { vendor: { select: { id: true, displayName: true } } },
  })

  if (products.length === 0) throw new Error('Carrito vacío o productos no disponibles')

  // Build order lines with price snapshots
  const lines = items.map(item => {
    const product = products.find(p => p.id === item.productId)
    if (!product) throw new Error(`Producto ${item.productId} no disponible`)
    if (product.trackStock && product.stock < item.quantity) {
      throw new Error(`Stock insuficiente para "${product.name}"`)
    }
    return {
      productId: product.id,
      vendorId: product.vendor.id,
      variantId: item.variantId ?? null,
      quantity: item.quantity,
      unitPrice: product.basePrice,
      taxRate: product.taxRate,
      productSnapshot: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        images: product.images,
        unit: product.unit,
        vendorName: product.vendor.displayName,
      },
    }
  })

  // Calculate totals
  const pricing = calculateOrderPricing(
    lines.map(line => ({
      unitPrice: Number(line.unitPrice),
      quantity: line.quantity,
      taxRate: Number(line.taxRate),
    }))
  )
  const shippingCost = await getShippingCost(validated.address.postalCode, pricing.subtotal)
  const { subtotal, taxAmount, grandTotal } = calculateOrderTotalsWithShippingCost(
    lines.map(line => ({
      unitPrice: Number(line.unitPrice),
      quantity: line.quantity,
      taxRate: Number(line.taxRate),
    })),
    shippingCost
  )

  // Save address if requested
  let addressId: string | undefined
  if (validated.saveAddress) {
    const saved = await db.address.create({
      data: {
        userId: session.user.id,
        ...validated.address,
        isDefault: false,
      },
    })
    addressId = saved.id
  }

  // Create payment intent (mock or Stripe)
  const payment = await createPaymentIntent(
    Math.round(grandTotal * 100), // cents
    { userId: session.user.id }
  )

  // Determine unique vendors
  const vendorIds = [...new Set(lines.map(l => l.vendorId))]

  // Create order in transaction
  const env = getServerEnv()
  const order = await db.$transaction(async tx => {
    const order = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        customerId: session.user.id,
        addressId: addressId ?? null,
        subtotal,
        shippingCost,
        taxAmount,
        grandTotal,
        status: 'PLACED',
        paymentStatus: 'PENDING',
        lines: { create: lines },
        payments: {
          create: {
            provider: env.paymentProvider === 'mock' ? 'mock' : 'stripe',
            providerRef: payment.id,
            amount: grandTotal,
            currency: 'EUR',
            status: 'PENDING',
          },
        },
        fulfillments: {
          create: vendorIds.map(vendorId => ({ vendorId, status: 'PENDING' })),
        },
      },
    })

    // Decrement stock
    for (const line of lines) {
      if (products.find(p => p.id === line.productId)?.trackStock) {
        await tx.product.update({
          where: { id: line.productId },
          data: { stock: { decrement: line.quantity } },
        })
      }
    }

    return order
  })

  return {
    orderId: order.id,
    clientSecret: payment.clientSecret,
    orderNumber: order.orderNumber,
  }
}

/**
 * Confirms an order after successful payment.
 * Called from the webhook (Stripe) or directly in mock mode.
 */
export async function confirmOrder(orderId: string, providerRef: string) {
  const payment = await db.payment.findFirst({
    where: { orderId, providerRef },
    include: { order: true },
  })

  if (!payment) return

  if (!shouldApplyPaymentSucceeded({
    paymentStatus: payment.status,
    orderPaymentStatus: payment.order.paymentStatus,
    orderStatus: payment.order.status,
  })) {
    revalidatePath(`/cuenta/pedidos`)
    return
  }

  await db.$transaction(async tx => {
    const paymentUpdate = await tx.payment.updateMany({
      where: { orderId, providerRef, status: { not: 'SUCCEEDED' } },
      data: { status: 'SUCCEEDED' },
    })
    const orderUpdate = await tx.order.updateMany({
      where: {
        id: orderId,
        OR: [
          { paymentStatus: { not: 'SUCCEEDED' } },
          { status: { not: 'PAYMENT_CONFIRMED' } },
        ],
      },
      data: { status: 'PAYMENT_CONFIRMED', paymentStatus: 'SUCCEEDED' },
    })

    if (paymentUpdate.count > 0 || orderUpdate.count > 0) {
      await tx.orderEvent.create({
        data: { orderId, type: 'PAYMENT_CONFIRMED', payload: { providerRef, source: 'manual-confirm' } },
      })
    }
  })

  revalidatePath(`/cuenta/pedidos`)
}

export async function getMyOrders() {
  const session = await auth()
  if (!session) return []

  return db.order.findMany({
    where: { customerId: session.user.id },
    orderBy: { placedAt: 'desc' },
    include: {
      lines: {
        include: { product: { select: { name: true, images: true, slug: true } } },
      },
    },
  })
}

export async function getOrderDetail(orderId: string) {
  const session = await auth()
  if (!session) return null

  return db.order.findFirst({
    where: { id: orderId, customerId: session.user.id },
    include: {
      lines: {
        include: { product: { select: { name: true, images: true, slug: true, unit: true } } },
      },
      address: true,
      payments: true,
      fulfillments: { include: { vendor: { select: { displayName: true } } } },
    },
  })
}
