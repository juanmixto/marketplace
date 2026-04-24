'use server'

import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { generateCorrelationId } from '@/lib/correlation'
import { getActionSession } from '@/lib/action-session'
import { isFeatureEnabled } from '@/lib/flags'
import { logger } from '@/lib/logger'
import { confirmOrder } from './confirm-order'
import { createOrder } from './create-order'
import type { CartItemInput } from '@/shared/types/cart'
import type { CheckoutFormData } from '@/domains/orders/checkout'
import { mapOrderErrorToUX } from '../errors'

export type CreateCheckoutOrderResult =
  | {
    ok: true
    orderId: string
    clientSecret: string
    orderNumber: string
    // True when the attempt already produced an Order.
    replayed?: boolean
  }
  | {
    ok: false
    error: string
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
export async function createCheckoutOrder(
  items: CartItemInput[],
  formData: CheckoutFormData,
  options: { promotionCode?: string | null; checkoutAttemptId?: string | null } = {}
): Promise<CreateCheckoutOrderResult> {
  const wrapperCorrelationId = generateCorrelationId()

  const session = await getActionSession()
  const checkoutEnabled = await isFeatureEnabled('kill-checkout', {
    userId: session?.user.id,
    email: session?.user.email ?? undefined,
    role: session?.user.role,
  })
  if (!checkoutEnabled) {
    logger.warn('checkout.kill_switch_active', {
      correlationId: wrapperCorrelationId,
      userId: session?.user.id,
    })
    return {
      ok: false,
      error: 'El checkout está temporalmente desactivado. Inténtalo en unos minutos.',
    }
  }

  try {
    const created = await createOrder(items, formData, options)

    if (!created.replayed && created.clientSecret.startsWith('mock_')) {
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
      orderId: created.orderId,
      clientSecret: created.clientSecret,
      orderNumber: created.orderNumber,
      ...(created.replayed ? { replayed: true } : {}),
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
      error: mapOrderErrorToUX(error),
    }
  }
}
