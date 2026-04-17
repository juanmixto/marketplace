/**
 * Client-side helpers for Web Push. These run in the browser only and
 * communicate with the SW + server actions to manage the subscription lifecycle.
 */

/**
 * Converts a base64-encoded VAPID public key to a Uint8Array suitable for
 * the `applicationServerKey` option of `pushManager.subscribe()`.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string
}

/**
 * Requests notification permission, subscribes the SW to push, and returns
 * the subscription keys the server needs. Returns `null` if the user
 * declines or the browser doesn't support push.
 */
export async function requestPushSubscription(): Promise<PushSubscriptionKeys | null> {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  })

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null

  return {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    userAgent: navigator.userAgent,
  }
}

/**
 * Returns the current push subscription state without prompting the user.
 */
export async function getPushSubscriptionState(): Promise<
  'unsupported' | 'denied' | 'prompt' | 'subscribed' | 'unsubscribed'
> {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return 'unsupported'

  const permission = Notification.permission
  if (permission === 'denied') return 'denied'

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  if (existing) return 'subscribed'

  return permission === 'default' ? 'prompt' : 'unsubscribed'
}

/**
 * Unsubscribes from push at the browser level and returns the endpoint
 * that was removed (so the caller can also tell the server).
 */
export async function unsubscribePushBrowser(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator)) return null

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return null

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  return endpoint
}
