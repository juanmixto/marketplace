import { capturePostHog } from '@/lib/posthog'

export type AnalyticsEventName =
  | 'page_view'
  | 'view_item'
  | 'search'
  | 'filter_used'
  | 'add_to_cart'
  | 'begin_checkout'
  | 'purchase'
  | 'contact_submit'
  | 'sign_up'
  // Buyer mutation events: every entry below MUST carry a `result:
  // 'success' | 'failure'` property. The Buyer Mutations Health
  // dashboard (docs/posthog-dashboards.md) reads `result` to compute
  // failure rate per surface and alerts when it spikes — that is how
  // the next "user reports a silent bug" gets caught before the user.
  | 'add_to_favorites'
  | 'remove_from_favorites'
  | 'address_changed'
  | 'buyer_profile_updated'
  | 'incident_resolved'
  | 'pwa_installable'
  | 'pwa_install_prompted'
  | 'pwa_install_accepted'
  | 'pwa_install_dismissed'
  | 'pwa_installed'
  | 'pwa_launched_standalone'
  | 'pwa_ios_hint_shown'
  | 'pwa_ios_hint_dismissed'
  | 'pwa_share_target_received'
  | 'seller_signup_completed'
  | 'seller_profile_completed'
  | 'seller_product_created'
  | 'seller_product_published'
  | 'seller_order_received'

/**
 * Subset of AnalyticsEventName that represents a buyer-side mutation
 * whose payload MUST carry `result: 'success' | 'failure'`. Used by
 * the contract test to validate every fire-site complies. Add new
 * mutation events here, never use a bare `result` string outside this
 * shape.
 */
export type BuyerMutationEvent =
  | 'add_to_favorites'
  | 'remove_from_favorites'
  | 'address_changed'
  | 'buyer_profile_updated'
  | 'incident_resolved'

export const BUYER_MUTATION_EVENTS: readonly BuyerMutationEvent[] = [
  'add_to_favorites',
  'remove_from_favorites',
  'address_changed',
  'buyer_profile_updated',
  'incident_resolved',
] as const

export interface AnalyticsItemInput {
  id: string
  name: string
  price?: number
  quantity?: number
  variant?: string | null
  brand?: string | null
  category?: string | null
}

export interface AnalyticsItem {
  item_id: string
  item_name: string
  price?: number
  quantity?: number
  item_variant?: string
  item_brand?: string
  item_category?: string
}

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>
    gtag?: (command: 'event' | 'config' | 'js', eventOrId: string | Date, params?: Record<string, unknown>) => void
  }
}

export function sanitizeAnalyticsPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
  ) as Partial<T>
}

export function createAnalyticsItem(input: AnalyticsItemInput): AnalyticsItem {
  return sanitizeAnalyticsPayload({
    item_id: input.id,
    item_name: input.name,
    price: input.price,
    quantity: input.quantity,
    item_variant: input.variant ?? undefined,
    item_brand: input.brand ?? undefined,
    item_category: input.category ?? undefined,
  }) as AnalyticsItem
}

export function trackAnalyticsEvent(event: AnalyticsEventName | string, payload: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return

  const sanitizedPayload = sanitizeAnalyticsPayload(payload)
  const dataLayerEvent = { event, ...sanitizedPayload }

  window.dataLayer = window.dataLayer ?? []
  window.dataLayer.push(dataLayerEvent)
  window.dispatchEvent(new CustomEvent('marketplace:analytics', { detail: dataLayerEvent }))

  if (typeof window.gtag === 'function') {
    window.gtag('event', event, sanitizedPayload)
  }

  // PostHog fan-out. PostHog manages its own pageview capture via
  // capture_pageview: true, so we skip forwarding page_view here to avoid
  // duplicates.
  if (event !== 'page_view') {
    capturePostHog(event, sanitizedPayload)
  }
}

/**
 * Thin alias that matches the PostHog integration spec. Prefer this name in
 * new call sites; both resolve to the same dual-sink pipeline.
 */
export const trackEvent = trackAnalyticsEvent

export function trackPageView(path: string, title?: string) {
  trackAnalyticsEvent('page_view', {
    page_path: path,
    page_title: title ?? (typeof document !== 'undefined' ? document.title : undefined),
    page_location: typeof window !== 'undefined' ? window.location.href : undefined,
  })
}
