import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { createPaymentConfirmedEventPayload } from '@/domains/orders/order-event-payload'

/**
 * Centralizes the payment persistence writes that need to stay in sync with
 * the order lifecycle.
 */
export async function markOrderPaymentIntentCreationFailed(
  orderId: string,
  _paymentError: unknown
): Promise<void> {
  await db.payment.updateMany({
    where: { orderId, providerRef: null, status: 'PENDING' },
    data: { status: 'FAILED' },
  })
  await db.order.updateMany({
    where: { id: orderId, paymentStatus: 'PENDING' },
    data: { paymentStatus: 'FAILED' },
  })
}

export async function linkOrderPaymentProviderRef(
  orderId: string,
  providerRef: string
): Promise<number> {
  const linked = await db.payment.updateMany({
    where: { orderId, providerRef: null, status: 'PENDING' },
    data: { providerRef },
  })
  return linked.count
}

export async function recordManualPaymentConfirmation(
  tx: Prisma.TransactionClient,
  orderId: string,
  providerRef: string
): Promise<{ paymentUpdated: number; orderUpdated: number }> {
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

  return {
    paymentUpdated: paymentUpdate.count,
    orderUpdated: orderUpdate.count,
  }
}
