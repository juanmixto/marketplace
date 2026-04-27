import { calculateShippingCostFromTables } from '@/domains/shipping/shared'

/**
 * Postal code used as a "good enough" default when surfacing an estimated
 * shipping cost on PDP / catalog cards — surfaces where the buyer hasn't
 * yet entered an address. Madrid centro is a representative peninsular
 * destination; the real cost is recomputed at checkout once the buyer
 * provides their CP. Per docs/audits/2026-04-27-launch-alignment.md H5,
 * showing *something* is the conversion-critical move; the exact cost
 * landing at checkout is communicated via `shippingDisclaimer` copy.
 */
export const DEFAULT_PENINSULA_POSTAL_CODE = '28001'

export async function getShippingCost(postalCode: string, subtotal: number) {
  const [{ db }, { getPublicMarketplaceConfig }] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/config'),
  ])
  const publicConfig = await getPublicMarketplaceConfig()

  const [zones, rates] = await Promise.all([
    db.shippingZone.findMany({
      where: { isActive: true },
      select: { id: true, name: true, provinces: true, isActive: true },
    }),
    db.shippingRate.findMany({
      where: { isActive: true },
      select: {
        id: true,
        zoneId: true,
        name: true,
        minOrderAmount: true,
        price: true,
        freeAbove: true,
        isActive: true,
      },
    }),
  ])

  return calculateShippingCostFromTables({
    postalCode,
    subtotal,
    zones,
    rates: rates.map(rate => ({
      ...rate,
      minOrderAmount: rate.minOrderAmount == null ? null : Number(rate.minOrderAmount),
      price: Number(rate.price),
      freeAbove: rate.freeAbove == null ? null : Number(rate.freeAbove),
    })),
    fallbackCost: publicConfig.FLAT_SHIPPING_COST,
  })
}

export async function getShippingConfigurationSnapshot() {
  const [{ db }, { getPublicMarketplaceConfig }] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/config'),
  ])
  const [zones, rates, publicConfig] = await Promise.all([
    db.shippingZone.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, provinces: true, isActive: true },
    }),
    db.shippingRate.findMany({
      where: { isActive: true },
      orderBy: [{ zoneId: 'asc' }, { minOrderAmount: 'desc' }],
      select: {
        id: true,
        zoneId: true,
        name: true,
        minOrderAmount: true,
        price: true,
        freeAbove: true,
        isActive: true,
      },
    }),
    getPublicMarketplaceConfig(),
  ])

  return {
    zones,
    rates: rates.map(rate => ({
      ...rate,
      minOrderAmount: rate.minOrderAmount == null ? null : Number(rate.minOrderAmount),
      price: Number(rate.price),
      freeAbove: rate.freeAbove == null ? null : Number(rate.freeAbove),
    })),
    fallbackCost: publicConfig.FLAT_SHIPPING_COST,
  }
}
