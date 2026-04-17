'use server'

import { ZodError } from 'zod'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { generateOrderNumber } from '@/lib/utils'
import { createPaymentIntent } from '@/domains/payments'
import {
  calculateOrderPricing,
  checkoutSchema,
  checkoutWithSavedAddressSchema,
  orderItemsSchema,
  type CheckoutFormData,
} from '@/domains/orders/checkout'
import { orderAddressSnapshotSchema, orderLineSnapshotSchema } from '@/types/order'
import { assertProviderRefForPaymentStatus, shouldApplyPaymentSucceeded } from '@/domains/payments'
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
import { getActionSession } from '@/lib/action-session'
import { revalidateCatalogExperience, safeRevalidatePath } from '@/lib/revalidate'
import { logger } from '@/lib/logger'
import { generateCorrelationId } from '@/lib/correlation'
import {
  createPaymentConfirmedEventPayload,
  createPaymentMismatchEventPayload,
} from '@/domains/orders/order-event-payload'
import {
  evaluatePromotions,
  type EvaluableCartLine,
} from '@/domains/promotions'
// eslint-disable-next-line no-restricted-imports -- loader is Prisma-backed and stays out of the promotions barrel
import { countBuyerRedemptions, loadEvaluablePromotions } from '@/domains/promotions/loader'

export type { CartItemInput } from '@/shared/types/cart'
import type { CartItemInput } from '@/shared/types/cart'

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

function roundCurrency2(value: number): number {
  return Math.round(value * 100) / 100
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

    if (/stock insuficiente|carrito vac[íi]o|no disponible|ya no esta disponible|ya no está disponible|debes seleccionar una variante|c[óo]digo postal|requerid|promoci[óo]n|c[óo]digo "/i.test(message)) {
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
  formData: CheckoutFormData,
  options: { promotionCode?: string | null } = {}
): Promise<{ orderId: string; clientSecret: string; orderNumber: string }> {
  const session = await getActionSession()
  if (!session) redirect('/login')
  const sessionUserId = session.user.id

  // Correlation ID threads through every log emitted by this checkout
  // attempt. Support can grep a single ID and reconstruct the entire
  // path: address resolution, stock checks, transaction boundary,
  // payment intent creation, mock confirmation. When #309 ships a
  // persistent checkoutAttemptId, prefer that.
  const correlationId = generateCorrelationId()
  logger.info('checkout.start', {
    correlationId,
    userId: sessionUserId,
    itemCount: items.length,
    hasSelectedAddress:
      typeof formData.selectedAddressId === 'string' && formData.selectedAddressId.length > 0,
    saveAddress: Boolean(formData.saveAddress),
    promotionCode: options.promotionCode ?? null,
  })

  const validatedItems = orderItemsSchema.parse(items)
  // If the buyer picked a saved address, the server resolves the real
  // address from the DB and ignores the submitted address payload. Use
  // the lenient schema so a stale field (e.g. a phone that no longer
  // matches the current regex on a years-old saved address) cannot block
  // the checkout. The real address is loaded here and used to hydrate
  // `validated.address` so every downstream snapshot / stock / order
  // path keeps working unchanged.
  const hasSelectedAddress =
    typeof formData.selectedAddressId === 'string' && formData.selectedAddressId.length > 0
  let validated: CheckoutFormData
  if (hasSelectedAddress) {
    // Lenient parse so a stale field on the submitted payload cannot
    // block the saved-address happy path.
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
      validated = {
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
    } else {
      // Fallback: the saved address was removed. Try to honor the
      // submitted address via the strict schema. If that also fails we
      // throw a friendly error telling the buyer to fix the form.
      logger.warn('checkout.address_fallback', {
        correlationId,
        userId: sessionUserId,
        selectedAddressId: parsedLenient.selectedAddressId,
        reason: 'saved-address-not-found',
      })
      try {
        validated = checkoutSchema.parse(formData)
      } catch {
        throw new Error(
          'La dirección guardada ya no está disponible. Elige otra o añade una nueva para continuar.'
        )
      }
    }
  } else {
    validated = checkoutSchema.parse(formData)
  }
  const promotionCode = options.promotionCode?.trim().toUpperCase() || null

  // Load products with current prices
  const products = await db.product.findMany({
    where: { id: { in: validatedItems.map(i => i.productId) }, ...getAvailableProductWhere() },
    include: {
      vendor: {
        select: {
          id: true,
          slug: true,
          displayName: true,
          // Stripe Connect fields drive destination charges below (#48).
          stripeAccountId: true,
          stripeOnboarded: true,
          commissionRate: true,
        },
      },
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

  // Stock precheck (#133): bail out BEFORE creating a Stripe PaymentIntent
  // when the latest committed stock is already insufficient. The transaction
  // below still uses FOR UPDATE to catch the race window between this read
  // and the write, but without this fast path the user would land on the
  // Stripe payment page only to have the order fail at submit, leaving us
  // with an orphaned PaymentIntent we'd have to cancel.
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
    } else {
      if (product.stock < item.quantity) {
        stockShortages.push(
          `"${product.name}" — solo quedan ${product.stock} ` +
          `${product.stock === 1 ? 'unidad' : 'unidades'}, pediste ${item.quantity}`
        )
      }
    }
  }

  if (stockShortages.length > 0) {
    throw new Error(`Stock insuficiente: ${stockShortages.join('; ')}`)
  }

  // Calculate totals
  const pricing = calculateOrderPricing(
    lines.map(line => ({
      unitPrice: Number(line.unitPrice),
      quantity: line.quantity,
      taxRate: Number(line.taxRate),
    }))
  )
  const baseShippingCost = await getShippingCost(validated.address.postalCode, pricing.subtotal)

  // Determine unique vendors (used both for the order record and for the
  // Stripe Connect destination-charge decision below).
  const vendorIds = [...new Set(lines.map(l => l.vendorId))]

  // Phase 2 of the promotions RFC: evaluate promotions, compute per-vendor
  // discounts and apply them to the order totals. This block is OPTIMISTIC:
  // it reads the redemption counts without a lock. The lock + atomic
  // redemption increment runs inside the order transaction below, so a race
  // that makes a promotion unredeemable between now and then throws and
  // rolls the whole thing back before we charge the buyer.
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

  // Reject the order upfront if the buyer typed a code that did not match
  // any eligible promotion — otherwise the buyer would go through checkout
  // and silently not receive the discount they expected.
  if (promotionCode && evaluation.unknownCodes.length > 0) {
    throw new Error(
      `El código "${promotionCode}" no es válido o ya no está disponible.`
    )
  }

  // Apply discount to subtotal for the downstream grand total. Tax is
  // included in unit prices, so we reduce the reported taxAmount
  // proportionally — keeps the reporting honest without changing the
  // accounting model.
  const subtotalBeforeDiscount = pricing.subtotal
  const subtotalAfterDiscount = roundCurrency2(subtotalBeforeDiscount - discountTotal)
  const taxRatio =
    subtotalBeforeDiscount > 0 ? subtotalAfterDiscount / subtotalBeforeDiscount : 1
  const subtotal = subtotalAfterDiscount
  const taxAmount = roundCurrency2(pricing.taxAmount * taxRatio)
  const grandTotal = roundCurrency2(subtotal + shippingCost)

  // Stripe Connect destination charges (#48):
  // For single-vendor orders where that vendor has completed Stripe Connect
  // onboarding, route the funds straight to the vendor's Express account
  // and keep the platform commission as `application_fee_amount`. Stripe
  // does the split atomically — no separate transfer call needed.
  //
  // Multi-vendor orders intentionally fall back to the current behavior
  // (funds stay on the platform account, paid out via the existing
  // settlement system). Stripe destination charges only support a single
  // recipient per Payment Intent.
  let connectDestination: { vendorAccountId: string; applicationFeeAmountCents: number } | undefined
  if (vendorIds.length === 1) {
    const onlyVendor = products.find(p => p.vendor.id === vendorIds[0])?.vendor
    if (onlyVendor?.stripeOnboarded && onlyVendor.stripeAccountId) {
      const grandTotalCents = Math.round(grandTotal * 100)
      const commissionRate = Number(onlyVendor.commissionRate)
      const applicationFeeAmountCents = Math.round(grandTotalCents * commissionRate)
      connectDestination = {
        vendorAccountId: onlyVendor.stripeAccountId,
        applicationFeeAmountCents,
      }
    }
  }

  // Persist-first (#404): we used to call createPaymentIntent() here,
  // BEFORE the transaction. If anything inside the transaction failed
  // (stock conflict, deadlock, promotion budget drained, schema drift,
  // etc.), the external Stripe PaymentIntent was orphaned with no
  // matching local Payment row. Now we open the transaction first and
  // create the Payment row with providerRef = null. createPaymentIntent
  // runs AFTER commit and the Payment row is then updated with the
  // real providerRef. If the post-commit provider call fails, we mark
  // the Payment as FAILED and re-throw so the buyer gets a friendly
  // "try again" message.
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma $queryRaw tagged-template typing requires cast
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma $queryRaw tagged-template typing requires cast
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

      // Phase 2 promotions: atomically claim the redemption budget for
      // every promotion we plan to apply. If another order drained the
      // budget between the evaluation read and this write, the UPDATE
      // affects 0 rows and we throw, rolling back stock + order. The
      // guard uses an explicit WHERE clause so maxRedemptions is enforced
      // at the SQL level rather than trusted from the in-memory snapshot.
      for (const applied of appliedByVendorId.values()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma $executeRaw tagged-template typing requires cast
        const updated = await (tx.$executeRaw as any)`
          UPDATE "Promotion"
          SET "redemptionCount" = "redemptionCount" + 1,
              "updatedAt" = NOW()
          WHERE id = ${applied.promotionId}
            AND "archivedAt" IS NULL
            AND (
              "maxRedemptions" IS NULL
              OR "redemptionCount" < "maxRedemptions"
            )
        `
        if (updated === 0) {
          throw new Error(
            'La promoción seleccionada ya no está disponible. Recarga el carrito e inténtalo de nuevo.'
          )
        }
      }

      return tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerId: sessionUserId,
          addressId: addressId ?? null,
          ...(includeShippingAddressSnapshot ? { shippingAddressSnapshot } : {}),
          subtotal,
          discountTotal,
          shippingCost,
          taxAmount,
          grandTotal,
          status: 'PLACED',
          paymentStatus: 'PENDING',
          lines: { create: lines },
          payments: {
            create: {
              provider: env.paymentProvider === 'mock' ? 'mock' : 'stripe',
              // providerRef is filled in AFTER the transaction commits
              // by createPaymentIntent, then linked back to this row
              // via payment.update below.
              providerRef: null,
              amount: grandTotal,
              currency: 'EUR',
              status: 'PENDING',
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
    })
  }

  let order
  try {
    order = await createOrderRecord(true)
  } catch (error) {
    if (!isMissingShippingAddressSnapshotColumnError(error)) {
      throw error
    }

    logger.error('checkout.snapshot_column_missing', {
      correlationId,
      userId: sessionUserId,
      error,
    })

    order = await createOrderRecord(false)
  }

  // Post-commit: the order + a placeholder Payment row exist. Now we
  // talk to the payment provider. If it throws we mark the Payment row
  // as FAILED, emit an OrderEvent for ops visibility, and re-throw so
  // createCheckoutOrder maps it to a friendly "try again" message.
  let payment
  try {
    payment = await createPaymentIntent(
      Math.round(grandTotal * 100), // cents
      { userId: sessionUserId },
      connectDestination ? { connect: connectDestination } : undefined
    )
  } catch (paymentError) {
    try {
      await db.payment.updateMany({
        where: { orderId: order.id, providerRef: null, status: 'PENDING' },
        data: { status: 'FAILED' },
      })
      await db.order.updateMany({
        where: { id: order.id, paymentStatus: 'PENDING' },
        data: { paymentStatus: 'FAILED' },
      })
      await db.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'PAYMENT_INTENT_CREATION_FAILED',
          payload: {
            recordedAt: new Date().toISOString(),
            error:
              paymentError instanceof Error
                ? paymentError.message
                : String(paymentError),
          },
        },
      })
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

  // Link the placeholder Payment row to the real provider id. updateMany
  // with the (orderId, providerRef=null) predicate so a retry that
  // somehow ran twice cannot overwrite an already-linked row.
  const linked = await db.payment.updateMany({
    where: { orderId: order.id, providerRef: null, status: 'PENDING' },
    data: { providerRef: payment.id },
  })
  if (linked.count !== 1) {
    // Defensive: if we somehow committed an order without exactly one
    // unlinked PENDING payment row, surface it loudly so it is caught
    // in dev / CI rather than going to production undetected.
    logger.error('checkout.payment_row_mismatch', {
      correlationId,
      userId: sessionUserId,
      orderId: order.id,
      count: linked.count,
      providerRef: payment.id,
    })
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

  logger.info('checkout.committed', {
    correlationId,
    userId: sessionUserId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    providerRef: payment.id,
    grandTotalCents: Math.round(grandTotal * 100),
  })

  return {
    orderId: order.id,
    clientSecret: payment.clientSecret,
    orderNumber: order.orderNumber,
  }
}

export async function createCheckoutOrder(
  items: CartItemInput[],
  formData: CheckoutFormData,
  options: { promotionCode?: string | null } = {}
): Promise<CreateCheckoutOrderResult> {
  // Wrapper correlation id covers the failure path (where createOrder
  // threw before its own correlationId could be surfaced) plus the
  // mock-confirmation follow-up call. On the success path createOrder
  // already logged `checkout.committed` with its own id.
  const wrapperCorrelationId = generateCorrelationId()
  try {
    const created = await createOrder(items, formData, options)

    if (created.clientSecret.startsWith('mock_')) {
      try {
        await confirmOrder(created.orderId, created.clientSecret.replace('_secret', ''))
      } catch (error) {
        logger.error('checkout.mock_confirmation_failed', {
          correlationId: wrapperCorrelationId,
          orderId: created.orderId,
          orderNumber: created.orderNumber,
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

    logger.error('checkout.tx_failed', {
      correlationId: wrapperCorrelationId,
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

  // Defensive amount verification — symmetric with the webhook handler's
  // doesWebhookPaymentMatchStoredPayment check. In mock mode the amount
  // was computed server-side so this should never fire, but if confirmOrder
  // is ever reused from another context the guard prevents confirming a
  // Payment whose amount was tampered with between creation and confirmation.
  const expectedAmountCents = Math.round(Number(payment.amount) * 100)
  const orderGrandTotalCents = Math.round(Number(payment.order.grandTotal) * 100)
  if (expectedAmountCents !== orderGrandTotalCents) {
    logger.error('checkout.confirm_amount_mismatch', {
      orderId,
      orderNumber: payment.order.orderNumber,
      providerRef,
      paymentAmountCents: expectedAmountCents,
      orderGrandTotalCents,
    })
    await db.orderEvent.create({
      data: {
        orderId,
        type: 'PAYMENT_MISMATCH',
        payload: createPaymentMismatchEventPayload({
          providerRef: providerRef ?? orderId,
          amount: orderGrandTotalCents,
          expectedAmount: Number(payment.amount),
          expectedCurrency: payment.currency,
        }),
      },
    })
    throw new Error('La verificación del importe ha fallado. Contacta con soporte.')
  }

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
