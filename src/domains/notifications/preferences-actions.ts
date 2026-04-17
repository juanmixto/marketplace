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

const ALL_CHANNELS: NotificationChannel[] = ['TELEGRAM']
const ALL_EVENT_TYPES: NotificationEventType[] = [
  'ORDER_CREATED',
  'ORDER_PENDING',
  'MESSAGE_RECEIVED',
]

async function requireVendorSession() {
  const session = await getActionSession()
  if (!session || !isVendor(session.user.role)) redirect('/login')
  return session
}

export async function getMyPreferences(): Promise<PreferenceRow[]> {
  const session = await requireVendorSession()

  const link = await db.telegramLink.findUnique({
    where: { userId: session.user.id },
    select: { isActive: true },
  })
  const channelLinked = link?.isActive ?? false

  const stored = await db.notificationPreference.findMany({
    where: { userId: session.user.id },
    select: { channel: true, eventType: true, enabled: true },
  })
  const storedMap = new Map(
    stored.map(row => [`${row.channel}:${row.eventType}`, row.enabled]),
  )

  const rows: PreferenceRow[] = []
  for (const channel of ALL_CHANNELS) {
    for (const eventType of ALL_EVENT_TYPES) {
      const key = `${channel}:${eventType}`
      const stored = storedMap.get(key)
      const enabled = stored ?? channelLinked
      rows.push({ channel, eventType, enabled })
    }
  }
  return rows
}

export async function setPreference(input: SetPreferenceInput): Promise<void> {
  const session = await requireVendorSession()
  const data = setPreferenceInputSchema.parse(input)

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
}
