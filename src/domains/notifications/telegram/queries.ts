import { db } from '@/lib/db'

export type TelegramLinkSummary = {
  linked: boolean
  username: string | null
  linkedAt: Date | null
}

export async function getTelegramLinkForUser(
  userId: string,
): Promise<TelegramLinkSummary> {
  const link = await db.telegramLink.findUnique({
    where: { userId },
    select: { isActive: true, username: true, linkedAt: true },
  })
  if (!link || !link.isActive) {
    return { linked: false, username: null, linkedAt: null }
  }
  return { linked: true, username: link.username, linkedAt: link.linkedAt }
}
