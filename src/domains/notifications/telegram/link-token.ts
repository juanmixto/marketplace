import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'

export const LINK_TOKEN_TTL_MS = 10 * 60 * 1000

export async function generateLinkToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS)
  await db.telegramLinkToken.create({
    data: { userId, token, expiresAt },
  })
  return token
}

export async function consumeLinkToken(
  token: string,
): Promise<{ userId: string } | null> {
  const now = new Date()
  const result = await db.telegramLinkToken.updateMany({
    where: {
      token,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  })
  if (result.count === 0) return null

  const record = await db.telegramLinkToken.findUnique({
    where: { token },
    select: { userId: true },
  })
  return record ? { userId: record.userId } : null
}
