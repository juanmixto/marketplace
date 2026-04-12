'use server'

import { ZodError } from 'zod'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { generateOrderNumber } from '@/lib/utils'
import { createPaymentIntent } from '@/domains/payments/provider'
import {
  calculateOrderPricing,
  calculateOrderTotalsWithShippingCost,
  checkoutSchema,
  orderItemsSchema,
  type CheckoutFormData,
} from '@/domains/orders/checkout'
import { orderAddressSnapshotSchema, orderLineSnapshotSchema } from '@/types/order'
import { assertProviderRefForPaymentStatus, shouldApplyPaymentSucceeded } from '@/domains/payments/webhook'
import { getServerEnv } from '@/lib/env'
import { getAvailableProductWhere } from '@/domains/catalog/availability'
import {
  assertVariantPriceChargeable,
  getAvailableStockForPurchase,
  getDefaultVariant,
  getSelectedVariant,
  getVariantAdjustedPrice,
  productRequiresVariantSelection,
} from '@/domains/catalog/variants'
import { getShippingCost } from '@/domains/shipping/calculator'
import { getActionSession } from '@/lib/action-session'
import { revalidateCatalogExperience, safeRevalidatePath } from '@/lib/revalidate'
import { createPaymentConfirmedEventPayload } from '@/domains/orders/order-event-payload'

export interface CartItemInput {
  productId: string
  variantId?: string
  quantity: number
}

export type CreateCheckoutOrderResult =
  | {
    ok: true
    orderId: string
    clientSecret: string
    orderNumber: string
  }
  | {
    ok: false
    error: string
  }

function isMissingShippingAddressSnapshotColumnError(error: unknown) {
  return error instanceof Error
    && /P2022|column .*does not exist|shippingAddressSnapshot/i.test(error.message)
}

function getCheckoutErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? 'Revisa los datos de la dirección y vuelve a intentarlo.'
  }

  if (error instanceof Error) {
    const message = error.message.trim()

    if (/stock insuficiente|carrito vac[íi]o|no disponible|ya no esta disponible|ya no está disponible|debes seleccionar una variante|c[óo]digo postal|requerid/i.test(message)) {
      return message
    }

    if (/direcci[óo]n guardada|no encontrada/i.test(message)) {
      return 'Tu dirección guardada ya no estaba disponible. Hemos mantenido los datos del formulario para que puedas completar la compra igualmente.'
    }

    if (isMissingShippingAddressSnapshotColumnError(error)) {
      return 'Estamos terminando una actualización interna del checkout. Recarga la página y vuelve a intentarlo.'
    }

    if (/payment intent|payment_intent|stripe|temporarily unavailable|timeout|timed out|deadlock|closed the connection|ECONN|network/i.test(message)) {
      return 'Ha habido un problema temporal al iniciar el pago. Inténtalo de nuevo en unos segundos.'
    }

    if (/no autorizado|unauthorized|iniciar sesi[óo]n|login/i.test(message)) {
      return 'Debes iniciar sesión para completar el pedido.'
    }
  }

  return 'No se pudo procesar el pedido. Revisa el stock disponible o actualiza el carrito e inténtalo de nuevo.'
}

/**
 * Creates an order from the current cart items.
 * Returns a client secret for Stripe (or mock token) to complete payment.
 *
 * Security: Price calculation is ALWAYS done server-side
 * - Client must send only productId, variantId, quantity (no prices)
 * - Prices are loaded from database (current catalog prices)
 * - Totals including tax and shipping are calculated server-side
 * - PaymentIntent amount is derived 100% from server calculations
 * - Webhook verification ensures the final payment amount matches the calculated total
 *
 * This prevents price manipulation attacks where a malicious client could:
 * - Intercept and lower prices in cart
 * - Modify prices in transit before payment
 * - Create orders that bypass pricing rules
 *
 * @param items - Cart items with only IDs and quantities (prices NOT accepted)
 * @param formData - Checkout form data (address, etc)
 * @returns Order ID, Stripe client secret, and order number for confirmation
 * @throws Error if items are malformed, stock is insufficient, or validation fails
 */
export async function createOrder(
  items: CartItemInput[],
  formData: CheckoutFormData
): Promise<{ orderId: string; clientSecret: string; orderNumber: string }> {
  const session = await getActionSession()
  if (!session) redirect('/login')
  const sessionUserId = session.user.id

  const validatedItems = orderItemsSchema.parse(items)
  const validated = checkoutSchema.parse(formData)

  // Load products with current prices
  const products = await db.product.findMany({
    where: { id: { in: validatedItems.map(i => i.productId) }, ...getAvailableProductWhere() },
    include: {
      vendor: { select: { id: true, slug: true, displayName: true } },
      variants: { where: { isActive: true } },
    },
  })

  if (products.length === 0) throw new Error('Carrito vacío o productos no disponibles')

  // Build order lines with price snapshots (without stock validation - will be done in transaction)
  const lines = validatedItems.map(item => {
    const product = products.find(p => p.id === item.productId)
    if (!product) throw new Error(`Producto ${item.productId} no disponible`)

    const purchasableProduct = {
      basePrice: Number(product.basePrice),
      stock: product.stock,
      trackStock: product.trackStock,
      variants: product.variants.map(variant => ({
        id: variant.id,
        name: variant.name,
        priceModifier: Number(variant.priceModifier),
        stock: variant.stock,
        isActive: variant.isActive,
      })),
    }
    const fallbackVariant = getDefaultVariant(purchasableProduct)
    const selectedVariant = getSelectedVariant(purchasableProduct, item.variantId) ?? (!item.variantId ? fallbackVariant : null)

    if (item.variantId && !selectedVariant) {
      throw new Error(`La variante seleccionada para "${product.name}" ya no esta disponible`)
    }

    if (productRequiresVariantSelection(purchasableProduct) && !selectedVariant) {
      throw new Error(`Debes seleccionar una variante para "${product.name}"`)
    }

    // NOTE: Stock validation moved to transaction to prevent race condition

    const unitPrice = getVariantAdjustedPrice(Number(product.basePrice), selectedVariant)
    assertVariantPriceChargeable(unitPrice, product.name)

    return {
      productId: product.id,
      vendorId: product.vendor.id,
      variantId: selectedVariant?.id ?? null,
      quantity: item.quantity,
      unitPrice,
      taxRate: product.taxRate,
      productSnapshot: orderLineSnapshotSchema.parse({
        id: product.id,
        name: product.name,
        slug: product.slug,
        images: product.images,
        unit: product.unit,
        vendorName: product.vendor.displayName,
        variantName: selectedVariant?.name ?? null,
      }),
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

  // Create payment intent (mock or Stripe)
  const payment = await createPaymentIntent(
    Math.round(grandTotal * 100), // cents
    { userId: sessionUserId }
  )

  // Determine unique vendors
  const vendorIds = [...new Set(lines.map(l => l.vendorId))]

  // Create order in transaction
  const env = getServerEnv()

  async function createOrderRecord(includeShippingAddressSnapshot: boolean) {
    return db.$transaction(async tx => {
      let addressId: string | null = null
      let shouldSaveNewAddress = Boolean(validated.saveAddress)
      let shippingAddressSnapshot = orderAddressSnapshotSchema.parse({
        ...validated.address,
        line2: validated.address.line2 ?? null,
        phone: validated.address.phone ?? null,
      })

      // Lock and decrement stock before creating the order record.
      // Doing this first reduces the chance of deadlocks when several buyers
      // try to checkout the same product at the same time.
      for (const line of lines) {
        const product = products.find(p => p.id === line.productId)
        if (!product?.trackStock) continue

        if (line.variantId) {
          // Lock variant row and check stock
          interface VariantRow {
            id: string
            stock: number | null
          }
          const [variant] = await (tx.$queryRaw as any)`
            SELECT id, stock FROM "ProductVariant"
            WHERE id = ${line.variantId}
            FOR UPDATE
          ` as VariantRow[]

          if (!variant) {
            throw new Error(`Variante "${product.name}" no encontrada`)
          }
          if (variant.stock !== null && variant.stock < line.quantity) {
            throw new Error(`Stock insuficiente para "${product.name}" (variante agotada)`)
          }

          await tx.productVariant.update({
            where: { id: line.variantId },
            data: { stock: variant.stock !== null ? { decrement: line.quantity } : undefined },
          })
        } else {
          // Lock product row and check stock
          interface ProductRow {
            id: string
            stock: number
          }
          const [lockedProduct] = await (tx.$queryRaw as any)`
            SELECT id, stock FROM "Product"
            WHERE id = ${line.productId}
            FOR UPDATE
          ` as ProductRow[]

          if (!lockedProduct) {
            throw new Error(`Producto "${product.name}" no encontrado`)
          }
          if (lockedProduct.stock < line.quantity) {
            throw new Error(`Stock insuficiente para "${product.name}"`)
          }

          await tx.product.update({
            where: { id: line.productId },
            data: { stock: { decrement: line.quantity } },
          })
        }
      }

      if (validated.selectedAddressId) {
        const existingAddress = await tx.address.findFirst({
          where: {
            id: validated.selectedAddressId,
            userId: sessionUserId,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            line1: true,
            line2: true,
            city: true,
            province: true,
            postalCode: true,
            phone: true,
          },
        })

        if (existingAddress) {
          addressId = existingAddress.id
          shouldSaveNewAddress = false
          shippingAddressSnapshot = orderAddressSnapshotSchema.parse(existingAddress)
        } else {
          console.warn('[checkout] saved address not found, falling back to submitted address', {
            userId: sessionUserId,
            selectedAddressId: validated.selectedAddressId,
          })
        }
      }

      if (!addressId && shouldSaveNewAddress) {
        try {
          const savedAddress = await tx.address.create({
            data: {
              userId: sessionUserId,
              ...validated.address,
              isDefault: false,
            },
          })
          addressId = savedAddress.id
          shippingAddressSnapshot = orderAddressSnapshotSchema.parse({
            firstName: savedAddress.firstName,
            lastName: savedAddress.lastName,
            line1: savedAddress.line1,
            line2: savedAddress.line2,
            city: savedAddress.city,
            province: savedAddress.province,
            postalCode: savedAddress.postalCode,
            phone: savedAddress.phone,
          })
        } catch (error) {
          console.error('[checkout] failed to save address, continuing without persisting it', {
            userId: sessionUserId,
            error,
          })
        }
      }

      return tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerId: sessionUserId,
          addressId: addressId ?? null,
          ...(includeShippingAddressSnapshot ? { shippingAddressSnapshot } : {}),
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
    })
  }

  let order
  try {
    order = await createOrderRecord(true)
  } catch (error) {
    if (!isMissingShippingAddressSnapshotColumnError(error)) {
      throw error
    }

    console.error('[checkout] shippingAddressSnapshot column missing, retrying without snapshot persistence', {
      error,
    })

    order = await createOrderRecord(false)
  }

  const affectedProductSlugs = [...new Set(products.map(product => product.slug))]
  const affectedVendorSlugs = [...new Set(products.map(product => product.vendor.slug))]

  revalidateCatalogExperience()
  affectedProductSlugs.forEach(productSlug => {
    safeRevalidatePath(`/productos/${productSlug}`)
  })
  affectedVendorSlugs.forEach(vendorSlug => {
    safeRevalidatePath(`/productores/${vendorSlug}`)
  })
  safeRevalidatePath('/buscar')
  safeRevalidatePath('/carrito')

  return {
    orderId: order.id,
    clientSecret: payment.clientSecret,
    orderNumber: order.orderNumber,
  }
}

export async function createCheckoutOrder(
  items: CartItemInput[],
  formData: CheckoutFormData
): Promise<CreateCheckoutOrderResult> {
  try {
    const created = await createOrder(items, formData)

    if (created.clientSecret.startsWith('mock_')) {
      try {
        await confirmOrder(created.orderId, created.clientSecret.replace('_secret', ''))
      } catch (error) {
        console.error('[checkout] mock confirmation failed after order creation', {
          orderId: created.orderId,
          error,
        })
      }
    }

    return {
      ok: true,
      ...created,
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }

    console.error('[checkout] order creation failed', {
      itemCount: items.length,
      selectedAddressId: formData.selectedAddressId ?? null,
      saveAddress: Boolean(formData.saveAddress),
      error,
    })

    return {
      ok: false,
      error: getCheckoutErrorMessage(error),
    }
  }
}

/**
 * Confirms an order after successful payment.
 * Called from the webhook (Stripe) or directly in mock mode.
 */
export async function confirmOrder(orderId: string, providerRef: string) {
  const env = getServerEnv()
  if (env.paymentProvider !== 'mock') {
    throw new Error('La confirmacion manual solo esta disponible en modo mock')
  }

  const session = await getActionSession()
  if (!session) redirect('/login')

  const payment = await db.payment.findFirst({
    where: { orderId, providerRef },
    include: { order: true },
  })

  if (!payment) return
  if (payment.order.customerId !== session.user.id) {
    throw new Error('No puedes confirmar un pedido que no te pertenece')
  }
  assertProviderRefForPaymentStatus({
    providerRef: payment.providerRef,
    nextStatus: 'SUCCEEDED',
  })

  if (!shouldApplyPaymentSucceeded({
    paymentStatus: payment.status,
    orderPaymentStatus: payment.order.paymentStatus,
    orderStatus: payment.order.status,
  })) {
    safeRevalidatePath(`/cuenta/pedidos`)
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
        data: {
          orderId,
          type: 'PAYMENT_CONFIRMED',
          payload: createPaymentConfirmedEventPayload({ providerRef, source: 'manual-confirm' }),
        },
      })
    }
  })

  revalidateCatalogExperience()
  safeRevalidatePath(`/cuenta/pedidos`)
  safeRevalidatePath(`/cuenta/pedidos/${orderId}`)
  safeRevalidatePath('/carrito')
}

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
      fulfillments: { include: { vendor: { select: { displayName: true } } } },
    },
  })
}
