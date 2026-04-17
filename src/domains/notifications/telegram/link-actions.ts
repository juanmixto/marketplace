'use server'

import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { isVendor } from '@/lib/roles'
import { safeRevalidatePath } from '@/lib/revalidate'
import { getTelegramConfig } from './config'
import { generateLinkToken } from './link-token'

async function requireVendorSession() {
  const session = await getActionSession()
  if (!session || !isVendor(session.user.role)) redirect('/login')
  return session
}

export async function generateMyTelegramLinkUrl(): Promise<string> {
  const session = await requireVendorSession()
  const config = getTelegramConfig()
  if (!config) {
    throw new Error('Telegram integration is not configured on this instance.')
  }
  const token = await generateLinkToken(session.user.id)
  return `https://t.me/${config.botUsername}?start=${token}`
}

export async function disconnectTelegram(): Promise<void> {
  const session = await requireVendorSession()
  await db.telegramLink.updateMany({
    where: { userId: session.user.id, isActive: true },
    data: { isActive: false },
  })
  safeRevalidatePath('/vendor/ajustes/telegram')
}
