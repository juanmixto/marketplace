import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getFeaturedProducts } from '@/domains/catalog/queries'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'

const limitSchema = z.coerce.number().int().min(1).max(24).default(12).catch(12)

// #1272: per-IP cap on the public catalog endpoint to slow down trivial
// scraping (price + stock + images + vendor exposed in a compact JSON).
// Fail-open by default so a Redis outage does not break legitimate
// browsing. The bucket sits well above human navigation: a real client
// hits this once per session via the prefetch worker, plus a handful of
// PDP loads. Anything north of one request per second per IP is bot
// behavior. Accepted side effect: an entire CG-NAT pool sharing one IP
// (rare on home ISPs in ES) gets throttled together.
const PUBLIC_CATALOG_LIMIT = 60
const PUBLIC_CATALOG_WINDOW_SECONDS = 60

/**
 * Lightweight JSON endpoint for the periodic background sync to prefetch
 * featured products. No auth required — this is public catalog data.
 * Returns a compact payload (no vendor relations, no heavy fields).
 */
export async function GET(request: Request) {
  const clientIP = getClientIP(request)
  const rl = await checkRateLimit(
    'catalog-public-ip',
    clientIP,
    PUBLIC_CATALOG_LIMIT,
    PUBLIC_CATALOG_WINDOW_SECONDS
  )
  if (!rl.success) {
    return NextResponse.json(
      { error: rl.message },
      {
        status: 429,
        headers: {
          'Retry-After': Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)).toString(),
          'X-RateLimit-Limit': String(PUBLIC_CATALOG_LIMIT),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rl.resetAt.toString(),
        },
      }
    )
  }

  const url = new URL(request.url)
  const limit = limitSchema.parse(url.searchParams.get('limit'))

  const products = await getFeaturedProducts(limit)

  const compact = products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: Number(p.basePrice),
    unit: p.unit,
    images: p.images.slice(0, 1), // Only first image for prefetch
    vendorName: p.vendor.displayName,
    vendorSlug: p.vendor.slug,
  }))

  return NextResponse.json(compact, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
