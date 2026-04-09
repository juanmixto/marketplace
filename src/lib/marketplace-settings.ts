export const MARKETPLACE_CONFIG_KEYS = {
  DEFAULT_COMMISSION_RATE: 'DEFAULT_COMMISSION_RATE',
  FREE_SHIPPING_THRESHOLD: 'FREE_SHIPPING_THRESHOLD',
  FLAT_SHIPPING_COST: 'FLAT_SHIPPING_COST',
  MAINTENANCE_MODE: 'MAINTENANCE_MODE',
  HERO_BANNER_TEXT: 'HERO_BANNER_TEXT',
} as const

export interface MarketplaceSettings {
  DEFAULT_COMMISSION_RATE: number
  FREE_SHIPPING_THRESHOLD: number
  FLAT_SHIPPING_COST: number
  MAINTENANCE_MODE: boolean
  HERO_BANNER_TEXT: string
}

export interface PublicMarketplaceSettings {
  FREE_SHIPPING_THRESHOLD: number
  FLAT_SHIPPING_COST: number
  MAINTENANCE_MODE: boolean
  HERO_BANNER_TEXT: string
}

export const MARKETPLACE_SETTINGS_DEFAULTS: MarketplaceSettings = {
  DEFAULT_COMMISSION_RATE: 0.12,
  FREE_SHIPPING_THRESHOLD: 35,
  FLAT_SHIPPING_COST: 4.95,
  MAINTENANCE_MODE: false,
  HERO_BANNER_TEXT: '',
}

const CONFIG_ALIASES: Record<keyof MarketplaceSettings, string[]> = {
  DEFAULT_COMMISSION_RATE: [MARKETPLACE_CONFIG_KEYS.DEFAULT_COMMISSION_RATE, 'commission_default'],
  FREE_SHIPPING_THRESHOLD: [MARKETPLACE_CONFIG_KEYS.FREE_SHIPPING_THRESHOLD, 'free_shipping_threshold'],
  FLAT_SHIPPING_COST: [MARKETPLACE_CONFIG_KEYS.FLAT_SHIPPING_COST, 'flat_shipping_cost'],
  MAINTENANCE_MODE: [MARKETPLACE_CONFIG_KEYS.MAINTENANCE_MODE, 'maintenance_mode'],
  HERO_BANNER_TEXT: [MARKETPLACE_CONFIG_KEYS.HERO_BANNER_TEXT, 'hero_banner_text'],
}

function toFiniteNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return fallback
}

function toText(value: unknown, fallback: string) {
  if (typeof value === 'string') return value.trim()
  return fallback
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

export function resolveMarketplaceSettings(
  entries: Array<{ key: string; value: unknown }>
): MarketplaceSettings {
  const byKey = new Map(entries.map(entry => [entry.key, entry.value]))

  return {
    DEFAULT_COMMISSION_RATE: toFiniteNumber(
      getConfigValue(byKey, 'DEFAULT_COMMISSION_RATE'),
      MARKETPLACE_SETTINGS_DEFAULTS.DEFAULT_COMMISSION_RATE
    ),
    FREE_SHIPPING_THRESHOLD: toFiniteNumber(
      getConfigValue(byKey, 'FREE_SHIPPING_THRESHOLD'),
      MARKETPLACE_SETTINGS_DEFAULTS.FREE_SHIPPING_THRESHOLD
    ),
    FLAT_SHIPPING_COST: toFiniteNumber(
      getConfigValue(byKey, 'FLAT_SHIPPING_COST'),
      MARKETPLACE_SETTINGS_DEFAULTS.FLAT_SHIPPING_COST
    ),
    MAINTENANCE_MODE: toBoolean(
      getConfigValue(byKey, 'MAINTENANCE_MODE'),
      MARKETPLACE_SETTINGS_DEFAULTS.MAINTENANCE_MODE
    ),
    HERO_BANNER_TEXT: toText(
      getConfigValue(byKey, 'HERO_BANNER_TEXT'),
      MARKETPLACE_SETTINGS_DEFAULTS.HERO_BANNER_TEXT
    ),
  }
}

function getConfigValue(
  entries: Map<string, unknown>,
  key: keyof MarketplaceSettings
) {
  for (const alias of CONFIG_ALIASES[key]) {
    if (entries.has(alias)) return entries.get(alias)
  }
  return undefined
}

export function toPublicMarketplaceSettings(
  settings: MarketplaceSettings
): PublicMarketplaceSettings {
  return {
    FREE_SHIPPING_THRESHOLD: settings.FREE_SHIPPING_THRESHOLD,
    FLAT_SHIPPING_COST: settings.FLAT_SHIPPING_COST,
    MAINTENANCE_MODE: settings.MAINTENANCE_MODE,
    HERO_BANNER_TEXT: settings.HERO_BANNER_TEXT,
  }
}

export function calculateShippingCost(
  subtotal: number,
  settings: Pick<PublicMarketplaceSettings, 'FREE_SHIPPING_THRESHOLD' | 'FLAT_SHIPPING_COST'>
) {
  return roundCurrency(
    subtotal >= settings.FREE_SHIPPING_THRESHOLD ? 0 : settings.FLAT_SHIPPING_COST
  )
}

