import { db } from '@/lib/db'
import { generateOrderNumber } from '@/lib/utils'
import { getShippingCost } from '@/domains/shipping/calculator'
import { orderLineSnapshotSchema, orderAddressSnapshotSchema } from '@/types/order'
import {
  advanceByCadence,
  computeCurrentPeriodEnd,
} from '@/domains/subscriptions/cadence'
import { sendSubscriptionRenewalChargedEmail } from '@/domains/subscriptions/emails'

/**
 * Phase 4b-β: materializes an Order + OrderLine + VendorFulfillment +
 * Payment for a subscription billing cycle that Stripe has just
 * charged. Triggered from the `invoice.paid` webhook.
 *
 * The renewal skips all the checkout-time validation (promotion
 * evaluation, variant selection, cart deduplication) because those
 * decisions were already frozen into the `SubscriptionPlan` and
 * `Subscription` rows at subscribe time. Stock is NOT decremented — a
 * subscription box is assumed to be produced on demand by the vendor;
 * if this turns out to be wrong for some vendors we can add an opt-in
 * flag to the plan in a later phase.
 *
 * Idempotent via `Payment.providerRef === invoice.id` — a replay of the
 * webhook finds the existing Payment row and bails out early.
 */
export interface RenewalInput {
  invoiceId: string
  subscriptionId: string
  amountPaidCents: number
}

export async function materializeSubscriptionRenewal(
  input: RenewalInput
): Promise<{ orderId: string | null; skipped: 'duplicate' | null }> {
  // Idempotency check: if we already booked an Order against this
  // invoice id, return early. Keeps the webhook handler safe to replay.
  const existingPayment = await db.payment.findUnique({
    where: { providerRef: input.invoiceId },
    select: { orderId: true },
  })
  if (existingPayment) {
    return { orderId: existingPayment.orderId, skipped: 'duplicate' }
  }

  const subscription = await db.subscription.findUnique({
    where: { id: input.subscriptionId },
    include: {
      buyer: { select: { email: true, firstName: true, lastName: true } },
      plan: {
        include: {
          product: true,
          vendor: { select: { id: true, slug: true, displayName: true } },
        },
      },
      shippingAddress: true,
    },
  })
  if (!subscription) {
    throw new Error(`Subscription ${input.subscriptionId} no encontrada`)
  }

  const plan = subscription.plan
  const product = plan.product
  const vendor = plan.vendor
  const address = subscription.shippingAddress

  const unitPrice = Number(plan.priceSnapshot)
  const taxRate = Number(plan.taxRateSnapshot)
  const subtotal = unitPrice
  const shippingCost = await getShippingCost(address.postalCode, subtotal)
  // Tax is included in unit prices across the rest of the marketplace.
  // Compute the tax-only slice for reporting parity with createOrder().
  const taxAmount =
    Math.round(((unitPrice * taxRate) / (1 + taxRate)) * 100) / 100
  const grandTotal = Math.round((subtotal + shippingCost) * 100) / 100

  const shippingSnapshot = orderAddressSnapshotSchema.parse({
    firstName: address.firstName,
    lastName: address.lastName,
    line1: address.line1,
    line2: address.line2 ?? null,
    city: address.city,
    province: address.province,
    postalCode: address.postalCode,
    phone: address.phone ?? null,
  })

  const productSnapshot = orderLineSnapshotSchema.parse({
    id: product.id,
    name: product.name,
    slug: product.slug,
    images: product.images,
    unit: product.unit,
    vendorName: vendor.displayName,
    variantName: null,
  })

  const order = await db.$transaction(async tx => {
    const created = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        customerId: subscription.buyerId,
        addressId: null,
        shippingAddressSnapshot: shippingSnapshot,
        subtotal,
        discountTotal: 0,
        shippingCost,
        taxAmount,
        grandTotal,
        // Stripe already told us the invoice was paid, so we can skip the
        // PLACED → PAYMENT_CONFIRMED transition and mark it directly.
        status: 'PAYMENT_CONFIRMED',
        paymentStatus: 'SUCCEEDED',
        lines: {
          create: [
            {
              productId: product.id,
              vendorId: vendor.id,
              variantId: null,
              quantity: 1,
              unitPrice,
              taxRate,
              productSnapshot,
            },
          ],
        },
        payments: {
          create: {
            provider: 'stripe',
            providerRef: input.invoiceId,
            amount: grandTotal,
            currency: 'EUR',
            status: 'SUCCEEDED',
          },
        },
        fulfillments: {
          create: [
            {
              vendorId: vendor.id,
              status: 'PENDING',
            },
          ],
        },
        events: {
          create: {
            type: 'SUBSCRIPTION_RENEWAL_CHARGED',
            payload: {
              subscriptionId: subscription.id,
              invoiceId: input.invoiceId,
              amountPaidCents: input.amountPaidCents,
            },
          },
        },
      },
      select: { id: true },
    })

    // Advance the subscription's delivery window one cadence forward so
    // the UI reflects the new next delivery and the next skip/cancel
    // action applies to the correct cycle.
    const nextDeliveryAt = advanceByCadence(subscription.nextDeliveryAt, plan.cadence)
    const currentPeriodEnd = computeCurrentPeriodEnd(nextDeliveryAt, plan.cadence)
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        nextDeliveryAt,
        currentPeriodEnd,
        status: 'ACTIVE',
      },
    })

    return { id: created.id, nextDeliveryAt }
  })

  // Phase 4b-δ: email the buyer with the renewal confirmation. The
  // send is best-effort: a flaky Resend must never prevent the webhook
  // from 200-ing, otherwise Stripe retries and we double-charge. The
  // dispatcher in emails.ts catches everything.
  if (subscription.buyer.email) {
    await sendSubscriptionRenewalChargedEmail({
      to: subscription.buyer.email,
      customerName: subscription.buyer.firstName || 'cliente',
      productName: product.name,
      vendorName: vendor.displayName,
      cadence: plan.cadence,
      amountEur: grandTotal,
      nextDeliveryAt: order.nextDeliveryAt,
    })
  }

  return { orderId: order.id, skipped: null }
}
