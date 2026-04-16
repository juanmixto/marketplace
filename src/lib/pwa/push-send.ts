import { db } from '@/lib/db'
import { vapidConfig } from './push-config'

export interface PushPayload {
  title: string
  body: string
  url?: string
  icon?: string
  tag?: string
}

/**
 * Sends a push notification to all subscriptions for the given user.
 * Silently removes subscriptions that return 404/410 (unsubscribed or
 * expired). Returns the number of successful deliveries.
 *
 * Degrades to a no-op when VAPID is not configured.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<number> {
  if (!vapidConfig) return 0

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })

  if (subscriptions.length === 0) return 0

  // Dynamic import so the module is only loaded when push is actually used.
  // This keeps the cold-start cost off pages that don't send notifications.
  const webpush = await import('web-push')
  webpush.setVapidDetails(
    vapidConfig.subject,
    vapidConfig.publicKey,
    vapidConfig.privateKey
  )

  const body = JSON.stringify(payload)
  let sent = 0
  const staleIds: string[] = []

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 60 * 60 } // 1 hour
        )
        sent += 1
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // Subscription is gone — mark for deletion.
          staleIds.push(sub.id)
        }
        // 429 / 5xx: transient — we just skip this delivery. A retry
        // mechanism can be added later without changing this interface.
      }
    })
  )

  // Clean up stale subscriptions in a single batch.
  if (staleIds.length > 0) {
    await db.pushSubscription.deleteMany({
      where: { id: { in: staleIds } },
    })
  }

  return sent
}
