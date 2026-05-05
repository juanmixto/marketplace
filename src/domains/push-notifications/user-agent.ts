import { createHash } from 'node:crypto'

/**
 * Stores push subscription user agents as a one-way hash so we can
 * avoid keeping a raw browser fingerprint in the database.
 */
export function hashPushUserAgent(userAgent?: string | null): string | null {
  const normalized = userAgent?.trim()
  if (!normalized) return null

  return createHash('sha256').update(normalized).digest('hex')
}

export function isHashedPushUserAgent(userAgent?: string | null): boolean {
  return /^[a-f0-9]{64}$/.test(userAgent ?? '')
}
