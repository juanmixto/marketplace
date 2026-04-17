const PREFETCH_CACHE = 'mp-prefetch-v1'

export interface PrefetchedProduct {
  id: string
  name: string
  slug: string
  price: number
  unit: string
  images: string[]
  vendorName: string
  vendorSlug: string
}

/**
 * Reads the catalog prefetch cache populated by the periodic background
 * sync in the SW. Returns null when the cache is empty or on any error
 * (unsupported browser, no SW, cache miss). The caller should always
 * fall back to a fresh network fetch.
 */
export async function readPrefetchedCatalog(): Promise<PrefetchedProduct[] | null> {
  if (typeof caches === 'undefined') return null

  try {
    const cache = await caches.open(PREFETCH_CACHE)
    const response = await cache.match('/api/catalog/featured?limit=12')
    if (!response) return null
    const data: PrefetchedProduct[] = await response.json()
    return data
  } catch {
    return null
  }
}
