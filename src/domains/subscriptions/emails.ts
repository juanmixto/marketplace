import { sendEmail } from '@/lib/email'
import { logger } from '@/lib/logger'
import { SubscriptionRenewalChargedEmail } from '@/emails/SubscriptionRenewalCharged'
import { SubscriptionPaymentFailedEmail } from '@/emails/SubscriptionPaymentFailed'

/**
 * Phase 4b-δ: transactional email dispatch for subscription lifecycle
 * events. Wrapped in try/catch at the call site — a flaky email
 * provider must never prevent the webhook from 200-ing, because Stripe
 * would then retry the whole event and double-charge the buyer.
 *
 * sendEmail() itself is a no-op when RESEND_API_KEY is missing, so the
 * integration tests that run without an API key silently skip the send
 * without changing behaviour. The dispatcher still validates the arg
 * shape so a bug in the webhook handler surfaces at unit-test time.
 */

function formatEurDate(value: Date): string {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(value)
}

function cadenceLabel(cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'): string {
  switch (cadence) {
    case 'WEEKLY':   return 'semanal'
    case 'BIWEEKLY': return 'quincenal'
    case 'MONTHLY':  return 'mensual'
  }
}

export interface RenewalEmailInput {
  to: string
  customerName: string
  productName: string
  vendorName: string
  cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
  amountEur: number
  nextDeliveryAt: Date
}

export async function sendSubscriptionRenewalChargedEmail(
  input: RenewalEmailInput
): Promise<void> {
  try {
    await sendEmail({
      to: input.to,
      subject: `Tu suscripción a ${input.productName} ha sido renovada`,
      react: SubscriptionRenewalChargedEmail({
        customerName: input.customerName,
        productName: input.productName,
        vendorName: input.vendorName,
        cadenceLabel: cadenceLabel(input.cadence),
        amountEur: input.amountEur,
        nextDeliveryDate: formatEurDate(input.nextDeliveryAt),
      }),
    })
  } catch (error) {
    logger.error('subscriptions.email.renewal_charged_failed', {
      error,
    })
  }
}

export interface PaymentFailedEmailInput {
  to: string
  customerName: string
  productName: string
  vendorName: string
}

export async function sendSubscriptionPaymentFailedEmail(
  input: PaymentFailedEmailInput
): Promise<void> {
  try {
    await sendEmail({
      to: input.to,
      subject: `No hemos podido cobrar tu suscripción a ${input.productName}`,
      react: SubscriptionPaymentFailedEmail({
        customerName: input.customerName,
        productName: input.productName,
        vendorName: input.vendorName,
      }),
    })
  } catch (error) {
    logger.error('subscriptions.email.payment_failed_failed', {
      error,
    })
  }
}
