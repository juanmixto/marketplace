import { createHash } from 'node:crypto'

export type PushUserAgentCategory = 'chrome' | 'safari' | 'firefox' | 'other'

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

/**
 * Buckets the browser family so we can keep a useful metric without
 * retaining the full fingerprint. Order matters: Chrome-family UAs
 * also mention Safari, so we check those tokens first.
 */
export function categorizePushUserAgent(userAgent?: string | null): PushUserAgentCategory {
  const normalized = userAgent?.trim()
  if (!normalized) return 'other'

  const lower = normalized.toLowerCase()
  if (
    lower.includes('chrome') ||
    lower.includes('crios') ||
    lower.includes('crmo') ||
    lower.includes('chromium')
  ) {
    return 'chrome'
  }
  if (lower.includes('firefox') || lower.includes('fxios')) {
    return 'firefox'
  }
  if (lower.includes('safari')) {
    return 'safari'
  }
  return 'other'
}
