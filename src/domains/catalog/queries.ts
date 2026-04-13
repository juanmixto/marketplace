import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { PAGINATION_DEFAULTS } from '@/lib/constants'
import { getAvailableProductWhere } from '@/domains/catalog/availability'
import { CACHE_TAGS } from '@/lib/cache-tags'
import { getDemoProductImages } from '@/domains/catalog/demo-product-images'
import { expandSearchQuery } from '@/lib/search-translation'

export interface ProductFilters {
  categorySlug?: string
  certifications?: string[]
  minPrice?: number
  maxPrice?: number
  vendorSlug?: string
  q?: string
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'popular'
  /** Cursor-based pagination: ID of the last product on the previous page */
  cursor?: string
  limit?: number
}

function normalizeProductFilters(filters: ProductFilters = {}) {
  const {
    categorySlug,
    certifications,
    minPrice,
    maxPrice,
    vendorSlug,
    q,
    sort = 'newest',
    cursor,
    limit = PAGINATION_DEFAULTS.PAGE_SIZE,
  } = filters

  return {
    categorySlug,
    certifications: certifications ? [...certifications].sort() : undefined,
    minPrice,
    maxPrice,
    vendorSlug,
    q,
    sort,
    cursor,
    limit,
  }
}

function withDemoProductImages<T extends { slug: string; images: string[] }>(product: T): T {
  return {
    ...product,
    images: getDemoProductImages(product.slug, product.images),
  }
}

async function getProductsUncached(filters: ProductFilters = {}) {
  const {
    categorySlug,
    certifications,
    minPrice,
    maxPrice,
    vendorSlug,
    q,
    sort,
    cursor,
    limit,
  } = normalizeProductFilters(filters)

  const where = {
    ...getAvailableProductWhere(),
    ...(categorySlug && { category: { slug: categorySlug } }),
    ...(vendorSlug && { vendor: { slug: vendorSlug } }),
    ...(certifications?.length && { certifications: { hasSome: certifications } }),
    ...(minPrice !== undefined && { basePrice: { gte: minPrice } }),
    ...(maxPrice !== undefined && { basePrice: { lte: maxPrice } }),
    ...(q && (() => {
      // Expand the query with EN→ES translations so an English-locale buyer
      // typing "honey" / "olive oil" matches Spanish "miel" / "aceite de oliva".
      const terms = expandSearchQuery(q)
      return {
        OR: terms.flatMap(term => [
          { name: { contains: term, mode: 'insensitive' as const } },
          { description: { contains: term, mode: 'insensitive' as const } },
          { tags: { has: term.toLowerCase() } },
        ]),
      }
    })()),
  }

  // Stable compound sort: primary sort field + id tiebreaker ensures
  // cursor pagination is consistent even for products with identical prices/dates.
  const orderBy = {
    price_asc:  [{ basePrice: 'asc' as const },  { id: 'asc' as const }],
    price_desc: [{ basePrice: 'desc' as const }, { id: 'asc' as const }],
    newest:     [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    popular:    [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
  }[sort]

  // Fetch one extra item to determine if a next page exists
  const products = await db.product.findMany({
    where,
    orderBy,
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    select: {
      id: true,
      vendorId: true,
      slug: true,
      name: true,
      images: true,
      basePrice: true,
      compareAtPrice: true,
      stock: true,
      trackStock: true,
      unit: true,
      certifications: true,
      originRegion: true,
      createdAt: true,
      vendor: { select: { slug: true, displayName: true, location: true } },
      category: { select: { name: true, slug: true } },
      variants: {
        where: { isActive: true },
        select: { id: true, name: true, priceModifier: true, stock: true, isActive: true },
      },
    },
  })

  const hasNextPage = products.length > limit
  if (hasNextPage) products.pop()

  const nextCursor = hasNextPage ? products[products.length - 1]?.id ?? null : null

  return {
    products: products.map(withDemoProductImages),
    nextCursor,
    hasNext: hasNextPage,
    hasPrev: !!cursor,
    limit,
  }
}

const getProductsCached = unstable_cache(
  async (serializedFilters: string) => getProductsUncached(JSON.parse(serializedFilters) as ProductFilters),
  ['catalog-products'],
  { tags: [CACHE_TAGS.catalog], revalidate: 300 }
)

export async function getProducts(filters: ProductFilters = {}) {
  if (process.env.NODE_ENV === 'test') return getProductsUncached(filters)
  return getProductsCached(JSON.stringify(normalizeProductFilters(filters)))
}

async function getProductBySlugUncached(slug: string) {
  const product = await db.product.findFirst({
    where: { slug, ...getAvailableProductWhere() },
    select: {
      id: true,
      vendorId: true,
      slug: true,
      name: true,
      description: true,
      images: true,
      basePrice: true,
      compareAtPrice: true,
      taxRate: true,
      stock: true,
      trackStock: true,
      unit: true,
      certifications: true,
      originRegion: true,
      createdAt: true,
      vendor: {
        select: {
          id: true,
          slug: true,
          displayName: true,
          description: true,
          location: true,
          logo: true,
          avgRating: true,
          totalReviews: true,
        },
      },
      category: { select: { name: true, slug: true } },
      variants: { where: { isActive: true } },
    },
  })

  return product ? withDemoProductImages(product) : null
}

const getProductBySlugCached = unstable_cache(
  async (slug: string) => getProductBySlugUncached(slug),
  ['product-by-slug'],
  { tags: [CACHE_TAGS.products], revalidate: 300 }
)

export async function getProductBySlug(slug: string) {
  if (process.env.NODE_ENV === 'test') return getProductBySlugUncached(slug)
  return getProductBySlugCached(slug)
}

async function getFeaturedProductsUncached(limit = 8) {
  const products = await db.product.findMany({
    where: getAvailableProductWhere(),
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      vendorId: true,
      slug: true,
      name: true,
      images: true,
      basePrice: true,
      compareAtPrice: true,
      stock: true,
      trackStock: true,
      unit: true,
      certifications: true,
      originRegion: true,
      createdAt: true,
      vendor: { select: { slug: true, displayName: true, location: true } },
      category: { select: { name: true, slug: true } },
      variants: {
        where: { isActive: true },
        select: { id: true, name: true, priceModifier: true, stock: true, isActive: true },
      },
    },
  })

  return products.map(withDemoProductImages)
}

const getFeaturedProductsCached = unstable_cache(
  async (limit: number) => getFeaturedProductsUncached(limit),
  ['featured-products'],
  { tags: [CACHE_TAGS.catalog, CACHE_TAGS.home, CACHE_TAGS.products], revalidate: 300 }
)

export async function getFeaturedProducts(limit = 8) {
  if (process.env.NODE_ENV === 'test') return getFeaturedProductsUncached(limit)
  return getFeaturedProductsCached(limit)
}

async function getCategoriesUncached() {
  return db.category.findMany({
    where: { isActive: true, parentId: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { products: { where: getAvailableProductWhere() } } },
    },
  })
}

const getCategoriesCached = unstable_cache(
  async () => getCategoriesUncached(),
  ['catalog-categories'],
  { tags: [CACHE_TAGS.categories, CACHE_TAGS.catalog, CACHE_TAGS.home], revalidate: 300 }
)

export async function getCategories() {
  if (process.env.NODE_ENV === 'test') return getCategoriesUncached()
  return getCategoriesCached()
}

async function getVendorsUncached(limit = 12) {
  return db.vendor.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { avgRating: 'desc' },
    take: limit,
    include: {
      _count: { select: { products: { where: getAvailableProductWhere() } } },
    },
  })
}

const getVendorsCached = unstable_cache(
  async (limit: number) => getVendorsUncached(limit),
  ['catalog-vendors'],
  { tags: [CACHE_TAGS.vendors, CACHE_TAGS.home], revalidate: 300 }
)

export async function getVendors(limit = 12) {
  if (process.env.NODE_ENV === 'test') return getVendorsUncached(limit)
  return getVendorsCached(limit)
}

async function getHomeSnapshotUncached() {
  const [featured, categories, vendors, activeProducts, activeVendors, averageVendorRating] = await Promise.all([
    getFeaturedProducts(8),
    getCategories(),
    getVendors(6),
    db.product.count({
      where: getAvailableProductWhere(),
    }),
    db.vendor.count({
      where: { status: 'ACTIVE' },
    }),
    db.vendor.aggregate({
      where: { status: 'ACTIVE', avgRating: { not: null } },
      _avg: { avgRating: true },
    }),
  ])

  return {
    featured,
    categories,
    vendors,
    stats: {
      activeProducts,
      activeVendors,
      averageRating: averageVendorRating._avg.avgRating ? Number(averageVendorRating._avg.avgRating) : null,
    },
  }
}

const getHomeSnapshotCached = unstable_cache(
  async () => getHomeSnapshotUncached(),
  ['home-snapshot'],
  { tags: [CACHE_TAGS.home, CACHE_TAGS.catalog, CACHE_TAGS.categories, CACHE_TAGS.vendors], revalidate: 3600 }
)

export async function getHomeSnapshot() {
  if (process.env.NODE_ENV === 'test') return getHomeSnapshotUncached()
  return getHomeSnapshotCached()
}

async function getVendorBySlugUncached(slug: string) {
  const vendor = await db.vendor.findUnique({
    where: { slug, status: 'ACTIVE' },
    include: {
      products: {
        where: getAvailableProductWhere(),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          vendorId: true,
          slug: true,
          name: true,
          images: true,
          basePrice: true,
          compareAtPrice: true,
          stock: true,
          trackStock: true,
          unit: true,
          certifications: true,
          originRegion: true,
          createdAt: true,
          category: { select: { name: true, slug: true } },
          variants: {
            where: { isActive: true },
            select: { id: true, name: true, priceModifier: true, stock: true, isActive: true },
          },
        },
      },
    },
  })

  if (!vendor) return null

  return {
    ...vendor,
    products: vendor.products.map(withDemoProductImages),
  }
}

const getVendorBySlugCached = unstable_cache(
  async (slug: string) => getVendorBySlugUncached(slug),
  ['vendor-by-slug'],
  { tags: [CACHE_TAGS.vendors], revalidate: 300 }
)

export async function getVendorBySlug(slug: string) {
  if (process.env.NODE_ENV === 'test') return getVendorBySlugUncached(slug)
  return getVendorBySlugCached(slug)
}
