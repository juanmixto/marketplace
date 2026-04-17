'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { isPushEnabled } from '@/lib/pwa/push-config'

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().max(500).optional(),
})

export type PushSubscriptionInput = z.infer<typeof subscribeSchema>

/**
 * Upserts a push subscription for the current user. If the same endpoint
 * already exists (e.g. the user re-subscribed on the same browser), the
 * keys are updated in place.
 */
export async function subscribeToPush(input: PushSubscriptionInput) {
  if (!isPushEnabled) {
    throw new Error('Push notifications are not configured on this instance.')
  }

  const session = await getActionSession()
  if (!session?.user) throw new Error('Unauthorized')

  const data = subscribeSchema.parse(input)

  await db.pushSubscription.upsert({
    where: { endpoint: data.endpoint },
    create: {
      userId: session.user.id,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      userAgent: data.userAgent,
    },
    update: {
      p256dh: data.p256dh,
      auth: data.auth,
      userAgent: data.userAgent,
    },
  })
}

/**
 * Removes a push subscription by endpoint. Allows the user to unsubscribe
 * from a specific browser/device.
 */
export async function unsubscribeFromPush(endpoint: string) {
  const session = await getActionSession()
  if (!session?.user) throw new Error('Unauthorized')

  await db.pushSubscription.deleteMany({
    where: {
      endpoint,
      userId: session.user.id, // ensure users can only delete their own
    },
  })
}
