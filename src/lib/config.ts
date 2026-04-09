import 'server-only'

import { revalidateTag, unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import {
  MARKETPLACE_CONFIG_KEYS,
  MARKETPLACE_SETTINGS_DEFAULTS,
  resolveMarketplaceSettings,
  toPublicMarketplaceSettings,
  type MarketplaceSettings,
} from '@/lib/marketplace-settings'

const MARKETPLACE_CONFIG_TAG = 'marketplace-config'

const loadMarketplaceSettings = unstable_cache(
  async () => {
    const rows = await db.marketplaceConfig.findMany({
      where: {
        key: {
          in: [
            MARKETPLACE_CONFIG_KEYS.DEFAULT_COMMISSION_RATE,
            MARKETPLACE_CONFIG_KEYS.FREE_SHIPPING_THRESHOLD,
            MARKETPLACE_CONFIG_KEYS.FLAT_SHIPPING_COST,
            MARKETPLACE_CONFIG_KEYS.MAINTENANCE_MODE,
            MARKETPLACE_CONFIG_KEYS.HERO_BANNER_TEXT,
            'commission_default',
            'free_shipping_threshold',
            'flat_shipping_cost',
            'maintenance_mode',
            'hero_banner_text',
          ],
        },
      },
      select: { key: true, value: true },
    })

    return resolveMarketplaceSettings(rows)
  },
  ['marketplace-config'],
  { tags: [MARKETPLACE_CONFIG_TAG] }
)

export async function getMarketplaceConfig() {
  return loadMarketplaceSettings()
}

export async function getPublicMarketplaceConfig() {
  const settings = await getMarketplaceConfig()
  return toPublicMarketplaceSettings(settings)
}

export async function setMarketplaceConfig(
  values: Partial<MarketplaceSettings>
) {
  const merged = {
    ...(await getMarketplaceConfig()),
    ...values,
  }

  const descriptions: Record<keyof MarketplaceSettings, string> = {
    DEFAULT_COMMISSION_RATE: 'Comisión por defecto aplicada a nuevos productores',
    FREE_SHIPPING_THRESHOLD: 'Importe mínimo para activar envío gratis',
    FLAT_SHIPPING_COST: 'Coste fijo de envío estándar',
    MAINTENANCE_MODE: 'Bloqueo temporal del storefront público',
    HERO_BANNER_TEXT: 'Texto promocional principal mostrado en home',
  }

  await db.$transaction(
    (Object.keys(MARKETPLACE_CONFIG_KEYS) as Array<keyof MarketplaceSettings>).map(key =>
      db.marketplaceConfig.upsert({
        where: { key },
        update: { value: merged[key], description: descriptions[key] },
        create: { key, value: merged[key], description: descriptions[key] },
      })
    )
  )

  revalidateTag(MARKETPLACE_CONFIG_TAG, 'max')
  return merged
}

export { MARKETPLACE_SETTINGS_DEFAULTS }
