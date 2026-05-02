// Connection-aware utilities. Wraps `navigator.connection` (Network
// Information API) with graceful fallback for browsers that don't
// support it (Safari, Firefox at the time of writing).
//
// All functions are safe to call on the server (return undefined) and
// in browsers without the API.

export type EffectiveType = '4g' | '3g' | '2g' | 'slow-2g'

interface NetworkInformation extends EventTarget {
  readonly effectiveType?: EffectiveType
  readonly saveData?: boolean
  readonly downlink?: number
  readonly rtt?: number
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation
  mozConnection?: NetworkInformation
  webkitConnection?: NetworkInformation
}

const getConnection = (): NetworkInformation | undefined => {
  if (typeof navigator === 'undefined') return undefined
  const nav = navigator as NavigatorWithConnection
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection
}

export const getEffectiveType = (): EffectiveType | undefined => {
  return getConnection()?.effectiveType
}

export const isSaveDataEnabled = (): boolean => {
  return getConnection()?.saveData === true
}

export const isSlowConnection = (): boolean => {
  const t = getEffectiveType()
  return t === '2g' || t === 'slow-2g'
}

/**
 * Subscribe to connection changes. Returns an unsubscribe function.
 * Calls `cb` once immediately with the current state, then on every
 * `change` event from `navigator.connection`.
 */
export const subscribeConnection = (
  cb: (info: { effectiveType?: EffectiveType; saveData: boolean; online: boolean }) => void,
): (() => void) => {
  const conn = getConnection()
  const emit = () =>
    cb({
      effectiveType: conn?.effectiveType,
      saveData: conn?.saveData === true,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
    })

  emit()

  const handler = () => emit()
  conn?.addEventListener?.('change', handler)
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handler)
    window.addEventListener('offline', handler)
  }
  return () => {
    conn?.removeEventListener?.('change', handler)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handler)
      window.removeEventListener('offline', handler)
    }
  }
}

/**
 * Adaptive image profile: `quality` for next/image plus `sizesDownscale`
 * applied to the CSS `sizes` attribute by SafeImage. Combining both
 * reductions on truly bad networks (Save-Data, 2G, slow-2g) saves an
 * additional ~50% of bytes on top of the quality drop (#1053).
 */
export type AdaptiveImageProfile = {
  /** next/image quality, 0–100. Next default is 75. */
  quality: number
  /** Multiplier applied to every `vw`/`px` value of the `sizes` attr.
   *  1.0 = no-op (default for 4G+/unknown). */
  sizesDownscale: number
}

/**
 * Returns the recommended {quality, sizesDownscale} profile for the
 * current connection. Used by adaptive image components to ship lighter
 * assets on slow networks without hardcoding the policy in every
 * callsite. See #1047/#1053 for the policy rationale.
 */
export const getAdaptiveImageProfile = (): AdaptiveImageProfile => {
  if (isSaveDataEnabled()) return { quality: 50, sizesDownscale: 0.66 }
  const t = getEffectiveType()
  if (t === 'slow-2g') return { quality: 50, sizesDownscale: 0.5 }
  if (t === '2g') return { quality: 50, sizesDownscale: 0.66 }
  if (t === '3g') return { quality: 70, sizesDownscale: 1.0 }
  // 4g+ or unknown — Next default is 75, we go a touch higher.
  return { quality: 85, sizesDownscale: 1.0 }
}

/**
 * Returns the recommended next/image quality (0-100) for the current
 * connection. Thin wrapper over {@link getAdaptiveImageProfile} kept
 * for backwards compatibility with existing call sites.
 */
export const getAdaptiveImageQuality = (): number => {
  return getAdaptiveImageProfile().quality
}
