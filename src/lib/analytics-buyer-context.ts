/**
 * Common context properties for CF-1 buyer funnel events. Centralised
 * here so every call site emits the same shape — without this, a
 * device breakdown across `catalog.viewed → product.viewed →
 * checkout.started` quickly drifts into per-event normalisations and
 * the funnel becomes useless.
 *
 * Browser-only. SSR returns null fields so nothing accidentally
 * captures a "device: unknown" event from a server prerender.
 */

export type BuyerFunnelDevice = 'mobile' | 'desktop' | 'tablet'

export interface BuyerFunnelContext {
  device: BuyerFunnelDevice | null
  referrer: string | null
}

/**
 * Mirrors PostHog's `$device_type` heuristic so dashboard breakdowns
 * remain consistent: `tablet` (≥ 768 and ≤ 1024 px), `mobile` (< 768
 * px), `desktop` otherwise. Tablet is split out because the catalog
 * grid layout switches at the same breakpoint and we want to spot a
 * regression there independently from phone sessions.
 */
export function detectBuyerFunnelDevice(): BuyerFunnelDevice | null {
  if (typeof window === 'undefined') return null
  if (typeof window.matchMedia !== 'function') return 'desktop'
  if (window.matchMedia('(max-width: 767px)').matches) return 'mobile'
  if (window.matchMedia('(max-width: 1024px)').matches) return 'tablet'
  return 'desktop'
}

export function getBuyerFunnelContext(): BuyerFunnelContext {
  if (typeof window === 'undefined') {
    return { device: null, referrer: null }
  }
  const referrer = typeof document !== 'undefined' && document.referrer
    ? document.referrer
    : null
  return {
    device: detectBuyerFunnelDevice(),
    referrer,
  }
}

/**
 * SessionStorage-backed dedupe used by funnel events that should fire
 * once per resource per session (e.g. `product.viewed` for the same
 * product slug). Survives React strict-mode double-mount in dev
 * because the first call writes the marker before the second mount
 * runs. Returns `true` when the caller should fire the event, `false`
 * if it has already been fired this session.
 *
 * Fail-open: storage errors (Safari private mode, quota) emit anyway —
 * a duplicate event is less bad than a missing one.
 */
export function shouldFireOnce(namespacedKey: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.sessionStorage.getItem(namespacedKey)) return false
    window.sessionStorage.setItem(namespacedKey, '1')
    return true
  } catch {
    return true
  }
}
