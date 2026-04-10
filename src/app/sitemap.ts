import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { getAvailableProductWhere } from '@/domains/catalog/availability'
import { getServerEnv } from '@/lib/env'

export const revalidate = 300

const siteUrl = new URL(getServerEnv().appUrl)

const toAbsoluteUrl = (path: string) => new URL(path, siteUrl).toString()

const staticRoutes: MetadataRoute.Sitemap = [
  { url: toAbsoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
  { url: toAbsoluteUrl('/productos'), changeFrequency: 'daily', priority: 0.9 },
  { url: toAbsoluteUrl('/productores'), changeFrequency: 'weekly', priority: 0.85 },
  { url: toAbsoluteUrl('/sobre-nosotros'), changeFrequency: 'monthly', priority: 0.4 },
  { url: toAbsoluteUrl('/como-funciona'), changeFrequency: 'monthly', priority: 0.55 },
  { url: toAbsoluteUrl('/como-vender'), changeFrequency: 'monthly', priority: 0.55 },
  { url: toAbsoluteUrl('/faq'), changeFrequency: 'monthly', priority: 0.35 },
  { url: toAbsoluteUrl('/contacto'), changeFrequency: 'monthly', priority: 0.35 },
  { url: toAbsoluteUrl('/privacidad'), changeFrequency: 'yearly', priority: 0.2 },
]

async function getActiveProductRoutes() {
  const products = await db.product.findMany({
    where: getAvailableProductWhere(),
    orderBy: { updatedAt: 'desc' },
    select: {
      slug: true,
      updatedAt: true,
    },
  })

  return products.map(product => ({
    url: toAbsoluteUrl(`/productos/${product.slug}`),
    lastModified: product.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))
}

async function getActiveVendorRoutes() {
  const vendors = await db.vendor.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
    select: {
      slug: true,
      updatedAt: true,
    },
  })

  return vendors.map(vendor => ({
    url: toAbsoluteUrl(`/productores/${vendor.slug}`),
    lastModified: vendor.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [...staticRoutes]

  const [productsResult, vendorsResult] = await Promise.allSettled([
    getActiveProductRoutes(),
    getActiveVendorRoutes(),
  ])

  if (productsResult.status === 'fulfilled') {
    entries.push(...productsResult.value)
  }

  if (vendorsResult.status === 'fulfilled') {
    entries.push(...vendorsResult.value)
  }

  return entries
}
