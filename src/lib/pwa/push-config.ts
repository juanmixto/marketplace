/**
 * VAPID configuration for Web Push. All values are read from env at import
 * time. The module exports `null` when push is not configured so callers
 * can feature-gate without try/catch.
 */

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

function loadVapidConfig(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return null
  return {
    publicKey,
    privateKey,
    subject: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  }
}

export const vapidConfig = loadVapidConfig()

/** True when VAPID keys are configured and push can be used. */
export const isPushEnabled = vapidConfig !== null
