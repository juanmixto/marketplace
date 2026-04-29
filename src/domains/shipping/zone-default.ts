/**
 * Geo-aware default postal codes for surfaces that need to estimate
 * shipping cost before the buyer has entered an address (PDP, future
 * catalog cards). Resolves from Cloudflare's ISO 3166-2 region header
 * (`cf-region-code`) so a Canarias visitor sees Canarias cost + label,
 * not peninsula's. The header is enabled in the marketplace's CF zone
 * via Network → "Add visitor location headers".
 *
 * When `cf-region-code` is missing (dev, non-CF traffic, edge config
 * drift) we fall back to peninsula — that matches the documented
 * majority case and the current pre-geo behavior.
 *
 * The exact cost is still recomputed at checkout once the buyer enters
 * their CP. This module's purpose is the *display* on conversion-
 * critical surfaces; checkout's `getShippingCost(realCp, ...)` call is
 * the one that the order is actually charged against.
 */

export type ShippingZoneSlug = 'peninsula' | 'baleares' | 'canarias' | 'ceuta' | 'melilla'

const ZONE_BY_REGION_CODE: Record<string, ShippingZoneSlug> = {
  'ES-IB': 'baleares',
  'ES-CN': 'canarias',
  'ES-CE': 'ceuta',
  'ES-ML': 'melilla',
}

const DEFAULT_POSTAL_CODE_BY_ZONE: Record<ShippingZoneSlug, string> = {
  peninsula: '28001', // Madrid centro — representative peninsular destination
  baleares: '07001', // Palma
  canarias: '35001', // Las Palmas de Gran Canaria
  ceuta: '51001',
  melilla: '52001',
}

interface HeadersLike {
  get(name: string): string | null
}

export function resolveShippingZoneFromHeaders(headers: HeadersLike): ShippingZoneSlug {
  const regionCode = headers.get('cf-region-code')?.toUpperCase()
  if (regionCode && ZONE_BY_REGION_CODE[regionCode]) {
    return ZONE_BY_REGION_CODE[regionCode]
  }
  return 'peninsula'
}

export function getDefaultPostalCodeForZone(zone: ShippingZoneSlug): string {
  return DEFAULT_POSTAL_CODE_BY_ZONE[zone]
}
