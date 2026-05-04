'use server'

import { db } from '@/lib/db'
import { hashCartForDedupe } from '@/domains/cart'
import { generateOrderNumber } from '@/lib/utils'
import { createPaymentIntent } from '@/domains/payments'
import {
  checkoutSchema,
  checkoutWithSavedAddressSchema,
  orderItemsSchema,
  type CheckoutFormData,
} from '@/domains/orders/checkout'
import { calculateOrderPricing } from '@/domains/pricing'
import { orderAddressSnapshotSchema, orderLineSnapshotSchema } from '@/types/order'
import { getServerEnv } from '@/lib/env'
import { getAvailableProductWhere } from '@/domains/catalog'
import {
  assertVariantPriceChargeable,
  getDefaultVariant,
  getSelectedVariant,
  getVariantAdjustedPrice,
  productRequiresVariantSelection,
} from '@/domains/catalog'
// eslint-disable-next-line no-restricted-imports -- calculator stays out of the shipping barrel (dynamic db import)
import { getShippingCost } from '@/domains/shipping/calculator'
import {
  loadCommissionResolverForVendor,
  resolveCommissionRate,
} from '@/domains/finance'
import { getActionSession } from '@/lib/action-session'
import { resolveGuestCustomer } from '../guest-customer'
import { logger } from '@/lib/logger'
import { generateCorrelationId } from '@/lib/correlation'
import {
  evaluatePromotions,
  type EvaluableCartLine,
} from '@/domains/promotions'
// eslint-disable-next-line no-restricted-imports -- loader is Prisma-backed and stays out of the promotions barrel
import { countBuyerRedemptions, loadEvaluablePromotions } from '@/domains/promotions/loader'
import { claimPromotionRedemptions } from '../promotion-claims'
import {
  linkOrderPaymentProviderRef,
  markOrderPaymentIntentCreationFailed,
} from '../payment-persistence'
import { reserveTrackedOrderLineStock } from '../inventory'
import {
  dispatchSideEffects,
  recordOrderCreatedSideEffects,
  recordPaymentIntentFailureSideEffects,
} from '../side-effects'
import {
  CheckoutAttemptCrossUserError,
  EmptyCartOrUnavailableProductsError,
  GuestEmailBelongsToRealAccountError,
  GuestEmailRequiredError,
  InsufficientStockError,
  InvalidPromotionCodeError,
  PaymentRowDivergedError,
  SavedAddressUnavailableError,
  VariantSelectionRequiredError,
  VariantUnavailableError,
  ProductUnavailableError,
} from '../errors'

export type { CartItemInput } from '@/shared/types/cart'
import type { CartItemInput } from '@/shared/types/cart'

export type CreateCheckoutOrderResult =
  | {
    ok: true
    orderId: string
    clientSecret: string
    orderNumber: string
    // True when this attempt already produced an Order.
    replayed?: boolean
  }
  | {
    ok: false
    error: string
  }

/**
 * Second return shape of createOrder: includes `replayed: true` when
 * the server short-circuits because an Order with the submitted
 * `checkoutAttemptId` already exists. See docs/checkout-dedupe.md for
 * the full UX matrix.
 */
export interface CreateOrderResult {
  orderId: string
  clientSecret: string
  orderNumber: string
  replayed: boolean
}

function roundCurrency2(value: number): number {
  return Math.round(value * 100) / 100
}

// DB audit P1.1 (#962): the createOrder transaction takes pessimistic row
// locks on ProductVariant via SELECT ... FOR UPDATE (see domains/orders/
// inventory.ts), so a slow lock contender must not silently roll back
// after the buyer has already entered card details. Pinning explicit
// timeout / maxWait makes the failure mode legible and version-stable.
const CREATE_ORDER_TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 } as const

/**
 * Detects Prisma's P2002 unique-constraint error on
 * `Order.checkoutAttemptId`. Used by `createOrder` to collapse a
 * concurrent double-submit into a single Order.
 */
function isCheckoutAttemptIdCollisionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (!/P2002|Unique constraint/i.test(error.message)) return false
  return /checkoutAttemptId|Order_checkoutAttemptId_key/i.test(error.message)
}

async function replayCheckoutAttempt({
  sessionUserId,
  correlationId,
  checkoutAttemptId,
  items,
}: {
  sessionUserId: string
  correlationId: string
  checkoutAttemptId: string
  items: CartItemInput[]
}): Promise<CreateOrderResult | null> {
  const existing = await db.order.findUnique({
    where: { checkoutAttemptId },
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      lines: {
        select: { productId: true, variantId: true, quantity: true },
      },
    },
  })
  if (!existing) return null

  if (existing.customerId !== sessionUserId) {
    logger.error('checkout.attempt_id_cross_user', {
      correlationId,
      checkoutAttemptId,
      userId: sessionUserId,
      existingOrderOwner: existing.customerId,
    })
    throw new CheckoutAttemptCrossUserError()
  }

  // Cart-shape check: a replay must carry the same cart. If the hash
  // diverges, the buyer has edited their cart but is presenting a
  // stale attempt id (back button, cached HTML, page restore). Refuse
  // to replay — returning the old Order would redirect them to a
  // confirmation page for a purchase that no longer reflects what
  // they intended to buy. The client must regenerate a fresh id.
  const cartHash = hashCartForDedupe(items)
  const existingCartHash = hashCartForDedupe(
    existing.lines.map(line => ({
      productId: line.productId,
      variantId: line.variantId ?? undefined,
      quantity: line.quantity,
    }))
  )
  if (existingCartHash !== cartHash) {
    logger.error('checkout.attempt_id_cart_mismatch', {
      correlationId,
      checkoutAttemptId,
      userId: sessionUserId,
      orderId: existing.id,
    })
    throw new Error('Sesión de checkout inválida. Recarga la página.')
  }

  logger.info('checkout.replayed', {
    correlationId,
    checkoutAttemptId,
    userId: sessionUserId,
    orderId: existing.id,
    orderNumber: existing.orderNumber,
  })

  return {
    orderId: existing.id,
    orderNumber: existing.orderNumber,
    clientSecret: '',
    replayed: true,
  }
}

async function resolveCheckoutInput({
  sessionUserId,
  formData,
  correlationId,
}: {
  sessionUserId: string
  formData: CheckoutFormData
  correlationId: string
}): Promise<CheckoutFormData> {
  const hasSelectedAddress =
    typeof formData.selectedAddressId === 'string' && formData.selectedAddressId.length > 0

  if (!hasSelectedAddress) {
    return checkoutSchema.parse(formData)
  }

  const parsedLenient = checkoutWithSavedAddressSchema.parse(formData)
  const savedAddress = await db.address.findFirst({
    where: { id: parsedLenient.selectedAddressId, userId: sessionUserId },
    select: {
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

  if (savedAddress) {
    return {
      address: {
        firstName: savedAddress.firstName,
        lastName: savedAddress.lastName,
        line1: savedAddress.line1,
        line2: savedAddress.line2 ?? undefined,
        city: savedAddress.city,
        province: savedAddress.province,
        postalCode: savedAddress.postalCode,
        phone: savedAddress.phone ?? undefined,
      },
      saveAddress: false,
      selectedAddressId: parsedLenient.selectedAddressId,
    }
  }

  logger.warn('checkout.address_fallback', {
    correlationId,
    userId: sessionUserId,
    selectedAddressId: parsedLenient.selectedAddressId,
    reason: 'saved-address-not-found',
  })

  try {
    return checkoutSchema.parse(formData)
  } catch {
    throw new SavedAddressUnavailableError()
  }
}

async function loadProductsAndLines({
  validatedItems,
}: {
  validatedItems: CartItemInput[]
}) {
  const products = await db.product.findMany({
    where: { id: { in: validatedItems.map(i => i.productId) }, ...getAvailableProductWhere() },
    include: {
      vendor: {
        select: {
          id: true,
          slug: true,
          displayName: true,
          stripeAccountId: true,
          stripeOnboarded: true,
          commissionRate: true,
        },
      },
      variants: { where: { isActive: true } },
    },
  })

  if (products.length === 0) throw new EmptyCartOrUnavailableProductsError()

  const lines = validatedItems.map(item => {
    const product = products.find(p => p.id === item.productId)
    if (!product) throw new ProductUnavailableError(item.productId)

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
    const selectedVariant =
      getSelectedVariant(purchasableProduct, item.variantId) ?? (!item.variantId ? fallbackVariant : null)

    if (item.variantId && !selectedVariant) {
      throw new VariantUnavailableError(product.name, true)
    }

    if (productRequiresVariantSelection(purchasableProduct) && !selectedVariant) {
      throw new VariantSelectionRequiredError(product.name)
    }

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

  return { products, lines }
}

function ensureStockAvailability(products: Awaited<ReturnType<typeof loadProductsAndLines>>['products'], validatedItems: CartItemInput[]) {
  const stockShortages: string[] = []
  for (const item of validatedItems) {
    const product = products.find(p => p.id === item.productId)
    if (!product || !product.trackStock) continue

    if (item.variantId) {
      const variant = product.variants.find(v => v.id === item.variantId)
      if (!variant || variant.stock == null) continue
      if (variant.stock < item.quantity) {
        const variantName = variant.name ? ` (${variant.name})` : ''
        stockShortages.push(
          `"${product.name}"${variantName} — solo quedan ${variant.stock} ` +
          `${variant.stock === 1 ? 'unidad' : 'unidades'}, pediste ${item.quantity}`
        )
      }
    } else if (product.stock < item.quantity) {
      stockShortages.push(
        `"${product.name}" — solo quedan ${product.stock} ` +
        `${product.stock === 1 ? 'unidad' : 'unidades'}, pediste ${item.quantity}`
      )
    }
  }

  if (stockShortages.length > 0) {
    throw new InsufficientStockError(`Stock insuficiente: ${stockShortages.join('; ')}`)
  }
}

/**
 * Resolve `application_fee_amount` for a single-vendor Connect order.
 *
 * #1162 H-6: previously this multiplied `grandTotal × Vendor.commissionRate`
 * flat, ignoring `CommissionRule` overrides per category or per vendor.
 * That made the platform fee in Stripe diverge from what settlement
 * reports later expected — the productor would receive 95 % when the
 * matched rule said 85 %, and we could not correct it after the fact.
 *
 * The new flow loads the rule set for `(vendorId, ∪ line.categoryId)`
 * in one round-trip and resolves a per-line rate via `resolveCommissionRate`.
 * Fee = Σ over lines of `round(lineGrossCents × resolvedRate)`. This
 * preserves Stripe's rounding semantics (every fee is integer cents)
 * and stays correct for multi-category carts inside a single vendor.
 *
 * Multi-vendor carts and vendors without Connect onboarding still
 * return `undefined` — those keep funds on the platform and rely on
 * the existing settlement system for payouts.
 */
async function buildConnectDestination({
  products,
  vendorIds,
  lines,
}: {
  products: Awaited<ReturnType<typeof loadProductsAndLines>>['products']
  vendorIds: string[]
  lines: Array<{ productId: string; vendorId: string; quantity: number; unitPrice: number }>
}): Promise<{ vendorAccountId: string; applicationFeeAmountCents: number } | undefined> {
  if (vendorIds.length !== 1) return undefined

  const onlyVendor = products.find(p => p.vendor.id === vendorIds[0])?.vendor
  if (!onlyVendor?.stripeOnboarded || !onlyVendor.stripeAccountId) return undefined

  const productById = new Map(products.map(p => [p.id, p]))
  const lineCategoryIds = lines.map(line => productById.get(line.productId)?.categoryId ?? null)

  const resolver = await loadCommissionResolverForVendor(onlyVendor.id, lineCategoryIds)

  let applicationFeeAmountCents = 0
  for (const line of lines) {
    const product = productById.get(line.productId)
    const lineGrossCents = Math.round(Number(line.unitPrice) * line.quantity * 100)
    const rate = resolveCommissionRate({
      vendorId: onlyVendor.id,
      categoryId: product?.categoryId ?? null,
      vendorRate: resolver.vendorRate,
      rules: resolver.rules,
    })
    applicationFeeAmountCents += Math.round(lineGrossCents * rate)
  }

  return {
    vendorAccountId: onlyVendor.stripeAccountId,
    applicationFeeAmountCents,
  }
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
  formData: CheckoutFormData,
  options: { promotionCode?: string | null; checkoutAttemptId?: string | null } = {}
): Promise<CreateOrderResult> {
  const session = await getActionSession()

  const correlationId = generateCorrelationId()
  const checkoutAttemptId = options.checkoutAttemptId ?? null

  // #1072: guest checkout. If no session, mint or reuse a User row
  // from the form's guestEmail. Real accounts are rejected here so the
  // order never auto-attaches to an email whose owner did not log in.
  let sessionUserId: string
  let isGuest = false
  if (session) {
    sessionUserId = session.user.id
  } else {
    const guestEmail = formData.guestEmail?.trim()
    if (!guestEmail) {
      throw new GuestEmailRequiredError()
    }
    const resolved = await resolveGuestCustomer(
      guestEmail,
      formData.address.firstName,
      formData.address.lastName,
    )
    if (!resolved.ok) {
      throw new GuestEmailBelongsToRealAccountError()
    }
    sessionUserId = resolved.userId
    isGuest = resolved.isGuest
  }

  if (checkoutAttemptId) {
    const replay = await replayCheckoutAttempt({
      sessionUserId,
      correlationId,
      checkoutAttemptId,
      items,
    })
    if (replay) {
      return replay
    }
  }

  logger.info('checkout.start', {
    correlationId,
    userId: sessionUserId,
    isGuest,
    itemCount: items.length,
    hasSelectedAddress:
      typeof formData.selectedAddressId === 'string' && formData.selectedAddressId.length > 0,
    saveAddress: Boolean(formData.saveAddress),
    promotionCode: options.promotionCode ?? null,
  })

  const validatedItems = orderItemsSchema.parse(items)
  const validated = await resolveCheckoutInput({ sessionUserId, formData, correlationId })
  const promotionCode = options.promotionCode?.trim().toUpperCase() || null

  const { products, lines } = await loadProductsAndLines({ validatedItems })
  ensureStockAvailability(products, validatedItems)

  const pricing = calculateOrderPricing(
    lines.map(line => ({
      unitPrice: Number(line.unitPrice),
      quantity: line.quantity,
      taxRate: Number(line.taxRate),
    }))
  )
  const baseShippingCost = await getShippingCost(validated.address.postalCode, pricing.subtotal)

  const vendorIds = [...new Set(lines.map(l => l.vendorId))]

  const productMetaById = new Map(products.map(p => [p.id, p]))
  const evaluableLines: EvaluableCartLine[] = lines.map(line => {
    const product = productMetaById.get(line.productId)
    return {
      productId: line.productId,
      vendorId: line.vendorId,
      categoryId: product?.categoryId ?? null,
      quantity: line.quantity,
      unitPrice: Number(line.unitPrice),
    }
  })
  const evaluationNow = new Date()
  const candidatePromotions = await loadEvaluablePromotions({
    vendorIds,
    code: promotionCode,
    now: evaluationNow,
  })
  const buyerRedemptions = await countBuyerRedemptions(
    sessionUserId,
    candidatePromotions.map(p => p.id)
  )
  const evaluation = evaluatePromotions({
    lines: evaluableLines,
    promotions: candidatePromotions,
    code: promotionCode,
    now: evaluationNow,
    shippingCost: baseShippingCost,
    buyerRedemptionsByPromotionId: buyerRedemptions,
  })

  const appliedByVendorId = evaluation.applied
  const discountTotal = evaluation.subtotalDiscount
  const shippingCost = roundCurrency2(
    Math.max(0, baseShippingCost - evaluation.shippingDiscount)
  )

  if (promotionCode && evaluation.unknownCodes.length > 0) {
    throw new InvalidPromotionCodeError(promotionCode)
  }

  const subtotalBeforeDiscount = pricing.subtotal
  const subtotalAfterDiscount = roundCurrency2(subtotalBeforeDiscount - discountTotal)
  const taxRatio =
    subtotalBeforeDiscount > 0 ? subtotalAfterDiscount / subtotalBeforeDiscount : 1
  const subtotal = subtotalAfterDiscount
  const taxAmount = roundCurrency2(pricing.taxAmount * taxRatio)
  const grandTotal = roundCurrency2(subtotal + shippingCost)

  // #1154 H-4: a 100%-off promo + free shipping (or fixed-amount equal to
  // subtotal) collapses grandTotal to 0. Stripe rejects PaymentIntents
  // with `amount: 0` ("amount_too_small"), and the previous flow committed
  // the Order with stock decremented + promotion claimed BEFORE the PI
  // call — so the Stripe rejection left a zombie Order with stock leaked
  // and a redemption burned. The bypass below short-circuits the PI call,
  // commits the Order as already-confirmed inside the same transaction,
  // and emits the buyer-confirmation notification that the webhook would
  // otherwise have fired. The Connect destination is irrelevant on a
  // free order (no funds to route).
  const isFreeOrder = grandTotal === 0

  const connectDestination = isFreeOrder
    ? undefined
    : await buildConnectDestination({ products, vendorIds, lines })

  const env = getServerEnv()

  const LOW_STOCK_THRESHOLD = 5
  const stockLowCandidates: Array<{
    productId: string
    vendorId: string
    productName: string
    remainingStock: number
  }> = []

  async function createOrderRecord() {
    return db.$transaction(async tx => {
      let addressId: string | null = null
      let shouldSaveNewAddress = Boolean(validated.saveAddress)
      let shippingAddressSnapshot = orderAddressSnapshotSchema.parse({
        ...validated.address,
        line2: validated.address.line2 ?? null,
        phone: validated.address.phone ?? null,
      })

      for (const line of lines) {
        const product = products.find(p => p.id === line.productId)
        if (!product?.trackStock) continue
        const stockLowCandidate = await reserveTrackedOrderLineStock(
          tx,
          {
            productId: line.productId,
            productName: product.name,
            variantId: line.variantId,
            quantity: line.quantity,
          },
          LOW_STOCK_THRESHOLD
        )
        if (stockLowCandidate) {
          stockLowCandidates.push(stockLowCandidate)
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
          logger.warn('checkout.address_fallback', {
            correlationId,
            userId: sessionUserId,
            selectedAddressId: validated.selectedAddressId,
            reason: 'saved-address-not-found-in-tx',
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
          logger.error('checkout.address_save_failed', {
            correlationId,
            userId: sessionUserId,
            error,
          })
        }
      }

      await claimPromotionRedemptions(tx, appliedByVendorId.values())

      const orderNumber = generateOrderNumber()

      return tx.order.create({
        data: {
          orderNumber,
          customerId: sessionUserId,
          addressId: addressId ?? null,
          ...(checkoutAttemptId ? { checkoutAttemptId } : {}),
          shippingAddressSnapshot,
          subtotal,
          discountTotal,
          shippingCost,
          taxAmount,
          grandTotal,
          status: isFreeOrder ? 'PAYMENT_CONFIRMED' : 'PLACED',
          paymentStatus: isFreeOrder ? 'SUCCEEDED' : 'PENDING',
          lines: { create: lines },
          payments: {
            create: {
              provider: env.paymentProvider === 'mock' ? 'mock' : 'stripe',
              // Synthetic providerRef on free orders preserves the UNIQUE
              // index without inventing a fake Stripe id; the `free_`
              // prefix makes operator queries trivial.
              providerRef: isFreeOrder ? `free_${orderNumber}` : null,
              amount: grandTotal,
              currency: 'EUR',
              status: isFreeOrder ? 'SUCCEEDED' : 'PENDING',
            },
          },
          fulfillments: {
            create: vendorIds.map(vendorId => {
              const applied = appliedByVendorId.get(vendorId)
              return {
                vendorId,
                status: 'PENDING' as const,
                promotionId: applied?.promotionId ?? null,
                discountAmount: applied
                  ? roundCurrency2(applied.discountAmount + applied.shippingDiscount)
                  : 0,
              }
            }),
          },
        },
      })
    }, CREATE_ORDER_TX_OPTIONS)
  }

  let order
  try {
    order = await createOrderRecord()
  } catch (error) {
    if (checkoutAttemptId && isCheckoutAttemptIdCollisionError(error)) {
      const winner = await db.order.findUnique({
        where: { checkoutAttemptId },
        select: {
          id: true,
          orderNumber: true,
          customerId: true,
        },
      })
      if (winner && winner.customerId === sessionUserId) {
        logger.info('checkout.concurrent_replayed', {
          correlationId,
          checkoutAttemptId,
          userId: sessionUserId,
          orderId: winner.id,
          orderNumber: winner.orderNumber,
        })
        return {
          orderId: winner.id,
          orderNumber: winner.orderNumber,
          clientSecret: '',
          replayed: true,
        }
      }
      throw error
    }

    throw error
  }

  // #1154 H-4: free order — Order was committed inside the transaction with
  // status PAYMENT_CONFIRMED + Payment SUCCEEDED + synthetic providerRef.
  // No PI to create, no provider ref to link. Emit the buyer confirmation
  // notification that webhook/confirm-order would otherwise have fired.
  let payment: { id: string; clientSecret: string }
  if (isFreeOrder) {
    payment = { id: `free_${order.orderNumber}`, clientSecret: '' }
    logger.info('checkout.free_order_committed', {
      correlationId,
      userId: sessionUserId,
      orderId: order.id,
      orderNumber: order.orderNumber,
    })
  } else {
    try {
      payment = await createPaymentIntent(
        Math.round(grandTotal * 100),
        { userId: sessionUserId, orderId: order.id, correlationId },
        connectDestination ? { connect: connectDestination } : undefined
      )
    } catch (paymentError) {
      const paymentFailureSideEffects = recordPaymentIntentFailureSideEffects(order.id, paymentError)

      try {
        await markOrderPaymentIntentCreationFailed(order.id, paymentError)
        await dispatchSideEffects(paymentFailureSideEffects, 'events')
      } catch (cleanupError) {
        logger.error('checkout.payment_mark_failed', {
          correlationId,
          userId: sessionUserId,
          orderId: order.id,
          cleanupError,
        })
      }
      logger.error('checkout.payment_intent_failed', {
        correlationId,
        userId: sessionUserId,
        orderId: order.id,
        grandTotalCents: Math.round(grandTotal * 100),
        error: paymentError,
      })
      throw paymentError
    }

    const linkResult = await linkOrderPaymentProviderRef(order.id, payment.id)
    if (linkResult.kind === 'diverged') {
      // #1169 H-9: a previous attempt linked a *different* Stripe PI to
      // this Order. Continuing would hand the buyer's session a clientSecret
      // for `payment.id` while the Order's Payment row points at the older
      // ref — every subsequent webhook for the new PI lands in DLQ. Hard
      // abort. The buyer's UI catches `PaymentRowDivergedError`, refreshes
      // the form, and gets a fresh `checkoutAttemptId`.
      logger.error('checkout.payment_row_diverged', {
        correlationId,
        userId: sessionUserId,
        orderId: order.id,
        existingProviderRef: linkResult.existingProviderRef,
        attemptedProviderRef: payment.id,
      })
      throw new PaymentRowDivergedError()
    }
    if (linkResult.kind === 'missing') {
      logger.error('checkout.payment_row_missing', {
        correlationId,
        userId: sessionUserId,
        orderId: order.id,
        providerRef: payment.id,
      })
      throw new PaymentRowDivergedError()
    }
    if (linkResult.kind === 'idempotent_match') {
      logger.info('checkout.payment_row_idempotent_match', {
        correlationId,
        userId: sessionUserId,
        orderId: order.id,
        providerRef: payment.id,
      })
    }
  }

  const affectedProductSlugs = [...new Set(products.map(product => product.slug))]
  const affectedVendorSlugs = [...new Set(products.map(product => product.vendor.slug))]

  const createdFulfillments = await db.vendorFulfillment.findMany({
    where: { orderId: order.id },
    select: { id: true, vendorId: true },
  })
  const fulfillmentByVendor = new Map(
    createdFulfillments.map(f => [f.vendorId, f.id]),
  )

  const orderSideEffects = recordOrderCreatedSideEffects({
    orderId: order.id,
    customerName:
      session?.user.name?.trim() ||
      `${formData.address.firstName} ${formData.address.lastName}`.trim() ||
      'Cliente',
    customerUserId: sessionUserId,
    vendorIds,
    fulfillmentByVendor,
    lines,
    productSlugs: affectedProductSlugs,
    vendorSlugs: affectedVendorSlugs,
    stockLowCandidates,
    isFreeOrder,
  })

  await dispatchSideEffects(orderSideEffects, 'revalidations')

  logger.info('checkout.committed', {
    correlationId,
    userId: sessionUserId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    providerRef: payment.id,
    grandTotalCents: Math.round(grandTotal * 100),
  })

  await dispatchSideEffects(orderSideEffects, 'notifications')

  return {
    orderId: order.id,
    clientSecret: payment.clientSecret,
    orderNumber: order.orderNumber,
    replayed: false,
  }
}
