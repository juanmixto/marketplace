import { db } from '@/lib/db'
import { isPushEnabled } from '@/lib/pwa/push-config'
import { sendPushToUser } from '@/lib/pwa/push-send'
import type { NotificationEventType } from '../types'

export interface WebPushMessage {
  title: string
  body: string
  /** Deep-link opened when the buyer/vendor taps the notification. */
  url: string
  /**
   * Tag used to collapse repeat pings of the same logical event in
   * the OS notification tray. Without it, Carlos would see two
   * "pedido enviado" banners per transition after a retry.
   */
  tag: string
  icon?: string
}

type SendOutcome =
  | { status: 'SENT'; delivered: number }
  | { status: 'SKIPPED'; reason: string }
  | { status: 'FAILED'; error: string }

/**
 * Sends a web-push notification to the given user, subject to the
 * same preference check the Telegram transport uses. Returns early
 * with SKIPPED when:
 *
 *   - VAPID is not configured (dev machines, preview deploys)
 *   - The user explicitly disabled this event on the WEB_PUSH channel
 *   - The user has no active subscriptions (no device opted in yet)
 *
 * Deliveries are logged to NotificationDelivery so the admin panel
 * and forensic greps work the same way they do for Telegram.
 */
export async function sendWebPushToUser(
  userId: string,
  eventType: NotificationEventType,
  message: WebPushMessage,
  options: { payloadRef?: string } = {},
): Promise<SendOutcome> {
  if (!isPushEnabled) {
    await logDelivery(userId, eventType, 'SKIPPED', 'PUSH_DISABLED', options.payloadRef)
    return { status: 'SKIPPED', reason: 'PUSH_DISABLED' }
  }

  const pref = await db.notificationPreference.findUnique({
    where: {
      userId_channel_eventType: {
        userId,
        channel: 'WEB_PUSH',
        eventType,
      },
    },
    select: { enabled: true },
  })
  if (pref && !pref.enabled) {
    await logDelivery(userId, eventType, 'SKIPPED', 'USER_DISABLED', options.payloadRef)
    return { status: 'SKIPPED', reason: 'USER_DISABLED' }
  }

  try {
    const delivered = await sendPushToUser(userId, message)
    if (delivered === 0) {
      await logDelivery(userId, eventType, 'SKIPPED', 'NO_SUBSCRIPTION', options.payloadRef)
      return { status: 'SKIPPED', reason: 'NO_SUBSCRIPTION' }
    }
    await logDelivery(userId, eventType, 'SENT', null, options.payloadRef)
    return { status: 'SENT', delivered }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await logDelivery(userId, eventType, 'FAILED', errorMessage, options.payloadRef)
    console.error('webpush.outbound.failed', { userId, eventType, error: errorMessage })
    return { status: 'FAILED', error: errorMessage }
  }
}

async function logDelivery(
  userId: string,
  eventType: NotificationEventType,
  status: 'SENT' | 'FAILED' | 'SKIPPED',
  error: string | null,
  payloadRef: string | undefined,
): Promise<void> {
  try {
    await db.notificationDelivery.create({
      data: {
        userId,
        channel: 'WEB_PUSH',
        eventType,
        status,
        error,
        payloadRef: payloadRef ?? null,
      },
    })
  } catch (err) {
    console.error('webpush.outbound.log_failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
