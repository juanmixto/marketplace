/**
 * GDPR Art 15 export tokens (#551).
 *
 * A session cookie alone is not enough to exfiltrate the user's PII
 * dump — the owner must prove inbox access. A request issues a
 * single-use, short-lived token that is HMAC-hashed at rest. The
 * token itself is full 256-bit entropy from crypto.randomBytes, so a
 * fast keyed hash is the right primitive (same reasoning as
 * src/domains/auth/email-verification.ts).
 */

import crypto from 'crypto'
import { db } from '@/lib/db'

const TOKEN_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

let cachedPepper: string | null = null
function getTokenPepper(): string {
  if (cachedPepper !== null) return cachedPepper
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  cachedPepper = secret
    ? `account-export-token-pepper:${secret}`
    : 'account-export-token-pepper:dev-only-fallback-do-not-use-in-prod'
  return cachedPepper
}

function hashToken(token: string): string {
  return crypto.createHmac('sha256', getTokenPepper()).update(token).digest('hex')
}

/**
 * Invalidate any outstanding tokens and issue a fresh one. Returns
 * the plaintext token to embed in the verification email.
 */
export async function createAccountExportToken(userId: string): Promise<string> {
  await db.accountExportToken.deleteMany({ where: { userId } })

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS)

  await db.accountExportToken.create({
    data: { userId, tokenHash, expiresAt },
  })

  return token
}

export interface ConsumeResult {
  ok: boolean
  userId?: string
  reason?: 'invalid' | 'expired' | 'already_used'
}

/**
 * Atomically consume an export token. Returns the owning userId on
 * success. Single-use guaranteed by the conditional updateMany.
 */
export async function consumeAccountExportToken(token: string): Promise<ConsumeResult> {
  if (!token) return { ok: false, reason: 'invalid' }

  const tokenHash = hashToken(token)
  const record = await db.accountExportToken.findUnique({ where: { tokenHash } })
  if (!record) return { ok: false, reason: 'invalid' }

  if (record.consumedAt) return { ok: false, reason: 'already_used' }
  if (record.expiresAt < new Date()) return { ok: false, reason: 'expired' }

  const consumed = await db.accountExportToken.updateMany({
    where: {
      tokenHash,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  })

  if (consumed.count !== 1) return { ok: false, reason: 'already_used' }

  return { ok: true, userId: record.userId }
}

export const ACCOUNT_EXPORT_TOKEN_TTL_MS = TOKEN_EXPIRY_MS
