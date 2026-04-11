import type { OrderStatus, PaymentStatus } from '@/generated/prisma/enums'

interface PaymentSnapshot {
  paymentStatus: PaymentStatus
  orderPaymentStatus: PaymentStatus
  orderStatus: OrderStatus
}

interface WebhookPaymentIntentSnapshot {
  amount?: number
  currency?: string
}

interface StoredPaymentSnapshot {
  amount: unknown
  currency: string
}

interface PaymentStatusTransitionInput {
  providerRef: string | null | undefined
  nextStatus: PaymentStatus
}

interface RetryWebhookOperationOptions {
  operationName: string
  maxAttempts?: number
  baseDelayMs?: number
  sleep?: (delayMs: number) => Promise<void>
  onRetry?: (context: { attempt: number; delayMs: number; error: unknown }) => void | Promise<void>
}

const RETRYABLE_PRISMA_ERROR_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024'])
const RETRYABLE_NODE_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
])

function getWebhookErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return undefined
  const code = 'code' in error ? (error as { code?: unknown }).code : undefined
  return typeof code === 'string' ? code : undefined
}

function getWebhookErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return ''
  const message = 'message' in error ? (error as { message?: unknown }).message : undefined
  return typeof message === 'string' ? message : ''
}

/**
 * Returns true if the mock webhook path is safe to use.
 * In production, mock processing must be blocked to prevent spoofed events.
 */
export function isMockWebhookAllowed(paymentProvider: string, nodeEnv: string): boolean {
  if (paymentProvider !== 'mock') return false
  return nodeEnv !== 'production'
}

/**
 * Extracts a stable idempotency key from a Stripe event id.
 * Returns null for mock events without an id (allow processing).
 */
export function getWebhookIdempotencyKey(eventId: string | undefined): string | null {
  return eventId ?? null
}

export function shouldApplyPaymentSucceeded(snapshot: PaymentSnapshot) {
  return !(
    snapshot.paymentStatus === 'SUCCEEDED' &&
    snapshot.orderPaymentStatus === 'SUCCEEDED' &&
    snapshot.orderStatus === 'PAYMENT_CONFIRMED'
  )
}

export function shouldApplyPaymentFailed(snapshot: PaymentSnapshot) {
  if (snapshot.paymentStatus === 'SUCCEEDED' || snapshot.orderPaymentStatus === 'SUCCEEDED') {
    return false
  }

  return !(
    snapshot.paymentStatus === 'FAILED' &&
    snapshot.orderPaymentStatus === 'FAILED'
  )
}

export function assertProviderRefForPaymentStatus({
  providerRef,
  nextStatus,
}: PaymentStatusTransitionInput) {
  if (nextStatus === 'SUCCEEDED' && (!providerRef || providerRef.trim().length === 0)) {
    throw new Error('providerRef requerido para marcar pago como completado')
  }
}

export function isRetryableWebhookError(error: unknown) {
  const code = getWebhookErrorCode(error)
  if (code && (RETRYABLE_PRISMA_ERROR_CODES.has(code) || RETRYABLE_NODE_ERROR_CODES.has(code))) {
    return true
  }

  const message = getWebhookErrorMessage(error).toLowerCase()
  return (
    message.includes('timeout') ||
    message.includes('temporarily unavailable') ||
    message.includes('connection reset') ||
    message.includes('connection refused') ||
    message.includes('server closed the connection')
  )
}

export async function retryWebhookOperation<T>(
  operation: () => Promise<T>,
  {
    operationName,
    maxAttempts = 3,
    baseDelayMs = 100,
    sleep = delayMs => new Promise(resolve => setTimeout(resolve, delayMs)),
    onRetry,
  }: RetryWebhookOperationOptions
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isRetryableWebhookError(error) || attempt === maxAttempts) {
        if (attempt === maxAttempts) {
          console.error('[stripe-webhook][retry-exhausted]', {
            operation: operationName,
            attempts: maxAttempts,
            error,
          })
        }
        throw error
      }

      const delayMs = baseDelayMs * 2 ** (attempt - 1)
      console.warn('[stripe-webhook][retry]', {
        operation: operationName,
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
        error,
      })
      await onRetry?.({ attempt, delayMs, error })
      await sleep(delayMs)
    }
  }

  throw new Error(`Webhook retry loop failed unexpectedly for ${operationName}`)
}

/**
 * Verify that the webhook amount matches the stored payment amount.
 * This prevents tampering where a client might try to pay less than the actual order total.
 *
 * Security flow:
 * 1. Client sends only IDs and quantities (no prices) to checkout
 * 2. Server calculates prices from database and creates PaymentIntent
 * 3. Server stores the calculated amount in Payment table
 * 4. Stripe processes payment and sends webhook with amount
 * 5. Webhook handler verifies: payment.amount === stored amount
 * 6. If mismatch: order is NOT confirmed, fraud audit created
 *
 * @param payment - Stored payment record with expected amount/currency
 * @param webhook - Webhook data from Stripe payment_intent event
 * @returns true if amounts match exactly, false otherwise
 */
export function doesWebhookPaymentMatchStoredPayment(
  payment: StoredPaymentSnapshot,
  webhook: WebhookPaymentIntentSnapshot
) {
  // Missing amount/currency in webhook is failure
  if (typeof webhook.amount !== 'number' || !webhook.currency) {
    return false
  }

  // Convert stored EUR to cents for comparison
  const storedAmountCents = Math.round(Number(payment.amount) * 100)

  // Exact match required (no rounding tolerance)
  if (webhook.amount !== storedAmountCents) {
    return false
  }

  // Currency must match
  return webhook.currency.toLowerCase() === payment.currency.toLowerCase()
}
