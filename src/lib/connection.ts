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
 * Returns the recommended next/image quality (0-100) for the current
 * connection. Used by adaptive image components to ship lighter assets
 * on slow networks without hardcoding the policy in every callsite.
 */
export const getAdaptiveImageQuality = (): number => {
  if (isSaveDataEnabled()) return 50
  const t = getEffectiveType()
  if (t === '2g' || t === 'slow-2g') return 50
  if (t === '3g') return 70
  return 85 // 4g+ or unknown — Next default is 75, we go a touch higher.
}
