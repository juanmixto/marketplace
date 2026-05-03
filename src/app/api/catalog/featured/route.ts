import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getFeaturedProducts } from '@/domains/catalog/queries'

const limitSchema = z.coerce.number().int().min(1).max(24).default(12).catch(12)

/**
 * Lightweight JSON endpoint for the periodic background sync to prefetch
 * featured products. No auth required — this is public catalog data.
 * Returns a compact payload (no vendor relations, no heavy fields).
 */
export async function GET(request: Request) {
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
