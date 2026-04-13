import type { OrderStatus } from '@/generated/prisma/enums'
import type { AnalyticsFilters, PresetRange, SerializableFilters } from './types'

const ORDER_STATUS_VALUES: readonly OrderStatus[] = [
  'PLACED',
  'PAYMENT_CONFIRMED',
  'PROCESSING',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
]

const PRESETS: readonly PresetRange[] = ['today', '7d', '30d', 'mtd', 'custom']

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function endOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function rangeForPreset(preset: PresetRange, now: Date = new Date()): { from: Date; to: Date } {
  const to = endOfDay(now)
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to }
    case '7d': {
      const from = startOfDay(now)
      from.setDate(from.getDate() - 6)
      return { from, to }
    }
    case 'mtd': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      return { from, to }
    }
    case '30d':
    default: {
      const from = startOfDay(now)
      from.setDate(from.getDate() - 29)
      return { from, to }
    }
  }
}

export function parseFilters(params: Record<string, string | string[] | undefined>): AnalyticsFilters {
  const raw = (key: string): string | undefined => {
    const v = params[key]
    return Array.isArray(v) ? v[0] : v
  }

  const presetRaw = raw('preset')
  const preset: PresetRange = PRESETS.includes(presetRaw as PresetRange)
    ? (presetRaw as PresetRange)
    : '30d'

  let from: Date
  let to: Date

  if (preset === 'custom') {
    const parsedFrom = parseDate(raw('from'))
    const parsedTo = parseDate(raw('to'))
    if (parsedFrom && parsedTo) {
      from = startOfDay(parsedFrom)
      to = endOfDay(parsedTo)
    } else {
      ;({ from, to } = rangeForPreset('30d'))
    }
  } else {
    ;({ from, to } = rangeForPreset(preset))
  }

  const orderStatusRaw = raw('status')
  const orderStatus = ORDER_STATUS_VALUES.includes(orderStatusRaw as OrderStatus)
    ? (orderStatusRaw as OrderStatus)
    : undefined

  return {
    preset,
    from,
    to,
    vendorId: raw('vendor') || undefined,
    categoryId: raw('category') || undefined,
    orderStatus,
  }
}

export function previousPeriod(filters: AnalyticsFilters): { from: Date; to: Date } {
  const spanMs = filters.to.getTime() - filters.from.getTime()
  const to = new Date(filters.from.getTime() - 1)
  const from = new Date(to.getTime() - spanMs)
  return { from, to }
}

export function describeRange(filters: AnalyticsFilters): string {
  const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  switch (filters.preset) {
    case 'today':
      return `Hoy · ${fmt(filters.from)}`
    case '7d':
      return `Últimos 7 días · ${fmt(filters.from)} – ${fmt(filters.to)}`
    case '30d':
      return `Últimos 30 días · ${fmt(filters.from)} – ${fmt(filters.to)}`
    case 'mtd':
      return `Este mes · ${fmt(filters.from)} – ${fmt(filters.to)}`
    case 'custom':
      return `${fmt(filters.from)} – ${fmt(filters.to)}`
  }
}

export function toSerializable(filters: AnalyticsFilters): SerializableFilters {
  return {
    preset: filters.preset,
    from: filters.from.toISOString(),
    to: filters.to.toISOString(),
    vendorId: filters.vendorId,
    categoryId: filters.categoryId,
    orderStatus: filters.orderStatus,
  }
}
