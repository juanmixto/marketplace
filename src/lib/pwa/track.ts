import { trackAnalyticsEvent, type AnalyticsEventName } from '@/lib/analytics'

type PwaEventName = Extract<AnalyticsEventName, `pwa_${string}`>

type Platform = 'android' | 'ios' | 'desktop' | 'unknown'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/windows|mac|linux|cros/i.test(ua)) return 'desktop'
  return 'unknown'
}

/**
 * Thin wrapper around `trackAnalyticsEvent` that tags every PWA funnel
 * event with the detected platform family and the current pathname.
 * Safe to call during render — it is a no-op on the server.
 */
export function trackPwaEvent(
  event: PwaEventName,
  extra: Record<string, unknown> = {}
) {
  if (typeof window === 'undefined') return
  trackAnalyticsEvent(event, {
    ua: detectPlatform(),
    source_url: window.location.pathname,
    ...extra,
  })
}
