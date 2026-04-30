import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { PAGINATION_DEFAULTS } from '@/lib/constants'
import { getAvailableProductWhere } from '@/domains/catalog/availability'
import { isCategoryVisible } from '@/domains/catalog/types'
import { CACHE_TAGS } from '@/lib/cache-tags'
import { getDemoProductImages } from '@/domains/catalog/demo-product-images'
import { expandSearchQuery } from '@/domains/catalog/search-translation'

// Issue #590: explicit DTOs for public reads. Selects live in the
// dependency-free `public-selects` module so the audit test can pin
// the allow-list without pulling Prisma.
export { PUBLIC_VENDOR_SELECT, PUBLIC_VARIANT_SELECT } from '@/domains/catalog/public-selects'
import { PUBLIC_VENDOR_SELECT, PUBLIC_VARIANT_SELECT } from '@/domains/catalog/public-selects'

export interface ProductFilters {
  categorySlug?: string
  certifications?: string[]
  minPrice?: number
  maxPrice?: number
  vendorSlug?: string
  q?: string
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'popular' | 'top_rated'
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

  const productSelect = {
    id: true,
    vendorId: true,
    slug: true,
    name: true,
    images: true,
    imageAlts: true,
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
  }

  let products: Array<Awaited<ReturnType<typeof db.product.findMany<{ select: typeof productSelect }>>>[number]>
  let hasNextPage: boolean

  if (sort === 'top_rated') {
    // Review-driven sort (#324). Prisma can't orderBy an aggregate on
    // the parent table, so: query Review.groupBy with the same where
    // constraint applied via a Product filter, get productIds ordered
    // by (avgRating desc, totalReviews desc), then hydrate the cards
    // preserving that order. Products with zero reviews fall back to
    // createdAt-desc so the grid still fills out — users asking for
    // "mejor valorados" see highly-rated first and newest fill the
    // rest, not an empty page.
    const ratedAggregates = await db.review.groupBy({
      by: ['productId'],
      where: { product: where },
      _avg: { rating: true },
      _count: { _all: true },
      orderBy: [
        { _avg: { rating: 'desc' } },
        { _count: { rating: 'desc' } },
      ],
      take: limit + 1,
      ...(cursor && { skip: 1 }),
    })

    const ratedIds = ratedAggregates.map(a => a.productId)
    const ratedProducts = ratedIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: ratedIds } },
          select: productSelect,
        })
      : []
    const byId = new Map(ratedProducts.map(p => [p.id, p]))
    const ordered = ratedIds.map(id => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p)

    // If we still have room on the page, fill with unrated products by
    // recency. Without this the "top rated" page is tiny on a young
    // catalog and looks broken.
    const deficit = (limit + 1) - ordered.length
    if (deficit > 0) {
      const unrated = await db.product.findMany({
        where: { ...where, id: { notIn: ratedIds.length > 0 ? ratedIds : [''] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: deficit,
        select: productSelect,
      })
      ordered.push(...unrated)
    }

    hasNextPage = ordered.length > limit
    if (hasNextPage) ordered.pop()
    products = ordered
  } else {
    // Stable compound sort: primary sort field + id tiebreaker ensures
    // cursor pagination is consistent even for products with identical
    // prices/dates.
    const orderBy = {
      price_asc:  [{ basePrice: 'asc' as const },  { id: 'asc' as const }],
      price_desc: [{ basePrice: 'desc' as const }, { id: 'asc' as const }],
      newest:     [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
      popular:    [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    }[sort as Exclude<typeof sort, 'top_rated'>]

    const rows = await db.product.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: productSelect,
    })

    hasNextPage = rows.length > limit
    if (hasNextPage) rows.pop()
    products = rows
  }

  const nextCursor = hasNextPage ? products[products.length - 1]?.id ?? null : null

  // Enrich every card with review aggregates in a single groupBy call.
  // Products with zero reviews get `{averageRating: null, totalReviews: 0}`
  // so the card component can decide whether to render the stars.
  const aggregates = products.length > 0
    ? await db.review.groupBy({
        by: ['productId'],
        where: { productId: { in: products.map(p => p.id) } },
        _avg: { rating: true },
        _count: { _all: true },
      })
    : []
  const aggByProduct = new Map(
    aggregates.map(a => [
      a.productId,
      {
        averageRating: a._avg.rating !== null ? Number(a._avg.rating) : null,
        totalReviews: a._count._all,
      },
    ]),
  )

  return {
    products: products.map(p => {
      const agg = aggByProduct.get(p.id) ?? { averageRating: null, totalReviews: 0 }
      return {
        ...withDemoProductImages(p),
        averageRating: agg.averageRating,
        totalReviews: agg.totalReviews,
      }
    }),
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
      imageAlts: true,
      basePrice: true,
      compareAtPrice: true,
      taxRate: true,
      stock: true,
      trackStock: true,
      unit: true,
      certifications: true,
      originRegion: true,
      createdAt: true,
      vendor: { select: PUBLIC_VENDOR_SELECT },
      categoryId: true,
      category: { select: { id: true, name: true, slug: true } },
      variants: { where: { isActive: true }, select: PUBLIC_VARIANT_SELECT },
      // Phase 4b-β: surface all active subscription plans for this
      // product (multi-cadence — one per WEEKLY/BIWEEKLY/MONTHLY). The
      // product detail page shows a single CTA that navigates to the
      // confirmation page, where the buyer picks the cadence from
      // whatever the vendor has published. Only non-archived plans are
      // returned; the confirmation page then filters out any without
      // a provisioned stripePriceId.
      subscriptionPlans: {
        where: { archivedAt: null },
        orderBy: { cadence: 'asc' },
        select: {
          id: true,
          cadence: true,
          priceSnapshot: true,
          archivedAt: true,
          stripePriceId: true,
        },
      },
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
      imageAlts: true,
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

export async function getVisibleCategories() {
  const all = await getCategories()
  return all.filter(isCategoryVisible)
}

export async function getVisibleCategorySlugs(): Promise<string[]> {
  const visible = await getVisibleCategories()
  return visible.map(c => c.slug)
}

async function getVendorsUncached(limit = 12) {
  return db.vendor.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { avgRating: 'desc' },
    take: limit,
    select: {
      ...PUBLIC_VENDOR_SELECT,
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

/**
 * Ghost producers detected from Telegram ingestion: vendors created
 * by `approveVendorLead` that have not yet been claimed by their
 * real owner. Status is `APPLYING` and a fresh `claimCode` is set;
 * once the producer claims, both columns clear and the vendor flips
 * to `ACTIVE`, joining the regular `getVendors` listing.
 *
 * Selected fields stay restricted to the public DTO — `claimCode`
 * and other PII never leave the boundary. The "ghost" flag in the
 * shape is computed (`status === 'APPLYING'`), not read directly,
 * to keep the public select map intact.
 */
async function getGhostProducersUncached(limit = 30) {
  return db.vendor.findMany({
    where: {
      status: 'APPLYING',
      claimCode: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: PUBLIC_VENDOR_SELECT,
  })
}

const getGhostProducersCached = unstable_cache(
  async (limit: number) => getGhostProducersUncached(limit),
  ['catalog-ghost-producers'],
  { tags: [CACHE_TAGS.vendors], revalidate: 300 },
)

export async function getGhostProducers(limit = 30) {
  if (process.env.NODE_ENV === 'test') return getGhostProducersUncached(limit)
  return getGhostProducersCached(limit)
}

async function getHomeSnapshotUncached() {
  const [featured, categories, vendors, activeProducts, activeVendors, averageVendorRating] = await Promise.all([
    getFeaturedProducts(8),
    getVisibleCategories(),
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
    select: {
      ...PUBLIC_VENDOR_SELECT,
      products: {
        where: getAvailableProductWhere(),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          vendorId: true,
          slug: true,
          name: true,
          images: true,
          imageAlts: true,
          basePrice: true,
          compareAtPrice: true,
          stock: true,
          trackStock: true,
          unit: true,
          certifications: true,
          originRegion: true,
          createdAt: true,
          category: { select: { name: true, slug: true } },
          variants: { where: { isActive: true }, select: PUBLIC_VARIANT_SELECT },
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
