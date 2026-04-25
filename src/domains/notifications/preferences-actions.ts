'use server'

import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { isVendor } from '@/lib/roles'
import { safeRevalidatePath } from '@/lib/revalidate'
import {
  setPreferenceInputSchema,
  type PreferenceRow,
  type SetPreferenceInput,
} from './preferences-schema'
import type { NotificationEventType, NotificationChannel } from './types'

const ALL_CHANNELS: NotificationChannel[] = ['TELEGRAM', 'WEB_PUSH']

const VENDOR_EVENT_TYPES: NotificationEventType[] = [
  'ORDER_CREATED',
  'ORDER_PENDING',
  'ORDER_DELIVERED',
  'LABEL_FAILED',
  'INCIDENT_OPENED',
  'MESSAGE_RECEIVED',
  'REVIEW_RECEIVED',
  'PAYOUT_PAID',
  'STOCK_LOW',
]

const BUYER_EVENT_TYPES: NotificationEventType[] = [
  'BUYER_ORDER_STATUS',
  'BUYER_FAVORITE_RESTOCK',
  'BUYER_FAVORITE_PRICE_DROP',
  'BUYER_VENDOR_APPLICATION_APPROVED',
  'BUYER_VENDOR_APPLICATION_REJECTED',
]

async function requireSession() {
  const session = await getActionSession()
  if (!session) redirect('/login')
  return session
}

async function requireVendorSession() {
  const session = await requireSession()
  if (!isVendor(session.user.role)) redirect('/login')
  return session
}

async function buildPreferenceRows(
  userId: string,
  eventTypes: NotificationEventType[],
): Promise<PreferenceRow[]> {
  // Default-enabled state is per-channel: if the user has hooked up
  // that transport (linked Telegram / subscribed a device to web
  // push) we opt them in so they start receiving every event, but
  // otherwise we default to disabled so linking a transport later
  // doesn't retroactively flood them.
  const [link, pushCount] = await Promise.all([
    db.telegramLink.findUnique({
      where: { userId },
      select: { isActive: true },
    }),
    db.pushSubscription.count({ where: { userId } }),
  ])
  const telegramLinked = link?.isActive ?? false
  const webPushSubscribed = pushCount > 0

  const stored = await db.notificationPreference.findMany({
    where: { userId },
    select: { channel: true, eventType: true, enabled: true },
  })
  const storedMap = new Map(
    stored.map(row => [`${row.channel}:${row.eventType}`, row.enabled]),
  )

  const rows: PreferenceRow[] = []
  for (const channel of ALL_CHANNELS) {
    for (const eventType of eventTypes) {
      const key = `${channel}:${eventType}`
      const stored = storedMap.get(key)
      const defaultEnabled = channel === 'TELEGRAM' ? telegramLinked : webPushSubscribed
      const enabled = stored ?? defaultEnabled
      rows.push({ channel, eventType, enabled })
    }
  }
  return rows
}

export async function getMyPreferences(): Promise<PreferenceRow[]> {
  const session = await requireVendorSession()
  return buildPreferenceRows(session.user.id, VENDOR_EVENT_TYPES)
}

export async function getMyBuyerPreferences(): Promise<PreferenceRow[]> {
  const session = await requireSession()
  return buildPreferenceRows(session.user.id, BUYER_EVENT_TYPES)
}

export async function setPreference(input: SetPreferenceInput): Promise<void> {
  const session = await requireSession()
  const data = setPreferenceInputSchema.parse(input)

  // Ensure the caller is only touching events they are entitled to manage.
  const isBuyerEvent = BUYER_EVENT_TYPES.includes(data.eventType)
  const isVendorEvent = VENDOR_EVENT_TYPES.includes(data.eventType)
  if (isVendorEvent && !isVendor(session.user.role)) redirect('/login')
  if (!isBuyerEvent && !isVendorEvent) redirect('/login')

  await db.notificationPreference.upsert({
    where: {
      userId_channel_eventType: {
        userId: session.user.id,
        channel: data.channel,
        eventType: data.eventType,
      },
    },
    create: {
      userId: session.user.id,
      channel: data.channel,
      eventType: data.eventType,
      enabled: data.enabled,
    },
    update: { enabled: data.enabled },
  })
  safeRevalidatePath('/vendor/ajustes/notificaciones')
  safeRevalidatePath('/cuenta/notificaciones')
}
