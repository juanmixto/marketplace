import type { Prisma } from '@/generated/prisma/client'
import { formatDate } from '@/lib/utils'

const EXPIRING_SOON_DAYS = 3

export function getAvailableProductWhere(now = new Date()): Prisma.ProductWhereInput {
  return {
    status: 'ACTIVE',
    deletedAt: null,
    OR: [
      { expiresAt: null },
      { expiresAt: { gt: now } },
    ],
  }
}

export function isProductExpired(expiresAt?: Date | string | null, now = new Date()) {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= now.getTime()
}

export function getExpirationTone(expiresAt?: Date | string | null, now = new Date()) {
  if (!expiresAt) return 'none' as const

  const expiresAtDate = new Date(expiresAt)
  if (isProductExpired(expiresAtDate, now)) return 'expired' as const

  const msUntilExpiration = expiresAtDate.getTime() - now.getTime()
  const daysUntilExpiration = msUntilExpiration / (1000 * 60 * 60 * 24)

  if (daysUntilExpiration <= 1) return 'today' as const
  if (daysUntilExpiration <= EXPIRING_SOON_DAYS) return 'soon' as const
  return 'scheduled' as const
}

export function formatExpirationLabel(expiresAt?: Date | string | null, now = new Date()) {
  if (!expiresAt) return null

  const tone = getExpirationTone(expiresAt, now)
  const formatted = formatDate(expiresAt)

  if (tone === 'expired') return `Caducado el ${formatted}`
  if (tone === 'today') return `Caduca hoy`
  if (tone === 'soon') return `Caduca el ${formatted}`
  return `Disponible hasta ${formatted}`
}

export function parseExpirationDateInput(value?: string | null) {
  if (!value) return null
  return new Date(`${value}T23:59:59.999Z`)
}

export function formatExpirationDateInput(value?: Date | string | null) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}
