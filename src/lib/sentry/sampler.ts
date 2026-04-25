/**
 * Dynamic Sentry trace sampling (#771).
 *
 * Checkout is the highest-stakes flow (revenue, idempotency, Stripe round-trips)
 * and 10% global sampling is too sparse to diagnose tail-latency regressions
 * before they bleed conversion. We bump the rate specifically for checkout
 * routes and let everything else fall back to the base rate.
 *
 * Keep this file tiny — it's imported on both client and server.
 */

const CHECKOUT_PATTERNS = [
  /\/checkout(?:\/|$)/,
  /\/api\/checkout(?:\/|$)/,
  /\/api\/orders(?:\/|$)/,
  /\/api\/stripe(?:\/|$)/,
]

const CHECKOUT_SAMPLE_RATE = 0.25

interface SamplingContext {
  name?: string
  request?: { url?: string }
  transactionContext?: { name?: string }
}

function matchesCheckout(context: SamplingContext): boolean {
  const candidates = [
    context.name,
    context.transactionContext?.name,
    context.request?.url,
  ]
  return candidates.some(
    value => typeof value === 'string' && CHECKOUT_PATTERNS.some(re => re.test(value))
  )
}

export function buildTracesSampler(baseRate: number) {
  return (context: SamplingContext): number => {
    if (matchesCheckout(context)) return CHECKOUT_SAMPLE_RATE
    return baseRate
  }
}
