// Network-resilience telemetry. PostHog events that surface what mobile
// users experience when the network is degraded — so we can prioritize
// future fixes with data instead of intuition.
//
// All these events are fail-open: if PostHog is misconfigured or down,
// trackAnalyticsEvent is a no-op (see src/lib/analytics.ts). Never let
// telemetry tumble user flows.
//
// PII RULES (mandatory): never include emails, addresses, full URLs with
// query/path that could carry user IDs, or any token. Stick to the
// shapes documented below.

import { trackAnalyticsEvent } from '@/lib/analytics'

export type NetworkErrorScope =
  | 'cart'
  | 'checkout'
  | 'orders'
  | 'favorites'
  | 'product'
  | 'auth'
  | 'other'

export type NetworkErrorType = 'timeout' | 'network' | 'abort' | '5xx' | 'unknown'

export type EffectiveType = '4g' | '3g' | '2g' | 'slow-2g'

export type BgSyncScope = 'cart_add' | 'cart_remove' | 'favorite_toggle' | 'other'

interface NetworkErrorParams {
  scope: NetworkErrorScope
  errorType: NetworkErrorType
  effectiveType?: EffectiveType
  saveData?: boolean
  retriesAttempted?: number
}

interface OfflineFallbackParams {
  /** Path attempted (no query string, no fragment). */
  attemptedPath: string
  swVersion?: string
}

interface BgSyncReplayParams {
  scope: BgSyncScope
  outcome: 'success' | 'failure'
  ageMs: number
}

interface PaymentRetryParams {
  errorType: string
  attemptNumber: number
  /** Hashed checkoutAttemptId or null — never the raw token. */
  checkoutAttemptHash?: string
}

interface ConnectionStateParams {
  effectiveType?: EffectiveType
  saveData?: boolean
}

export const trackNetworkError = (params: NetworkErrorParams): void => {
  trackAnalyticsEvent('network_error', { ...params })
}

export const trackOfflineFallback = (params: OfflineFallbackParams): void => {
  trackAnalyticsEvent('offline_fallback_shown', { ...params })
}

export const trackBgSyncReplay = (params: BgSyncReplayParams): void => {
  trackAnalyticsEvent('bg_sync_replay', { ...params })
}

export const trackPaymentRetry = (params: PaymentRetryParams): void => {
  trackAnalyticsEvent('payment_retry', { ...params })
}

export const trackConnectionSlowDetected = (params: ConnectionStateParams): void => {
  trackAnalyticsEvent('connection_slow_detected', { ...params })
}

export const trackConnectionOffline = (): void => {
  trackAnalyticsEvent('connection_offline', {})
}

export const trackConnectionRestored = (params: ConnectionStateParams = {}): void => {
  trackAnalyticsEvent('connection_restored', { ...params })
}
