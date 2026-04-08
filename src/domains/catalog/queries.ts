import { db } from '@/lib/db'
import { PAGINATION_DEFAULTS } from '@/lib/constants'

export interface ProductFilters {
  categorySlug?: string
  certifications?: string[]
  minPrice?: number
  maxPrice?: number
  vendorSlug?: string
  q?: string
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'popular'
  page?: number
  limit?: number
}

export async function getProducts(filters: ProductFilters = {}) {
  const {
    categorySlug,
    certifications,
    minPrice,
    maxPrice,
    vendorSlug,
    q,
    sort = 'newest',
    page = 1,
    limit = PAGINATION_DEFAULTS.PAGE_SIZE,
  } = filters

  const skip = (page - 1) * limit

  const where = {
    status: 'ACTIVE' as const,
    deletedAt: null,
    ...(categorySlug && { category: { slug: categorySlug } }),
    ...(vendorSlug && { vendor: { slug: vendorSlug } }),
    ...(certifications?.length && { certifications: { hasSome: certifications } }),
    ...(minPrice !== undefined && { basePrice: { gte: minPrice } }),
    ...(maxPrice !== undefined && { basePrice: { lte: maxPrice } }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { description: { contains: q, mode: 'insensitive' as const } },
        { tags: { has: q.toLowerCase() } },
      ],
    }),
  }

  const orderBy = {
    price_asc:  { basePrice: 'asc' as const },
    price_desc: { basePrice: 'desc' as const },
    newest:     { createdAt: 'desc' as const },
    popular:    { createdAt: 'desc' as const }, // TODO: replace with sales count
  }[sort]

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        vendor: { select: { slug: true, displayName: true, location: true } },
        category: { select: { name: true, slug: true } },
      },
    }),
    db.product.count({ where }),
  ])

  return {
    products,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  }
}

export async function getProductBySlug(slug: string) {
  return db.product.findUnique({
    where: { slug, status: 'ACTIVE', deletedAt: null },
    include: {
      vendor: {
        select: {
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
}

export async function getFeaturedProducts(limit = 8) {
  return db.product.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      vendor: { select: { slug: true, displayName: true, location: true } },
      category: { select: { name: true, slug: true } },
    },
  })
}

export async function getCategories() {
  return db.category.findMany({
    where: { isActive: true, parentId: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { products: { where: { status: 'ACTIVE' } } } },
    },
  })
}

export async function getVendors(limit = 12) {
  return db.vendor.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { avgRating: 'desc' },
    take: limit,
    include: {
      _count: { select: { products: { where: { status: 'ACTIVE' } } } },
    },
  })
}

export async function getVendorBySlug(slug: string) {
  return db.vendor.findUnique({
    where: { slug, status: 'ACTIVE' },
    include: {
      products: {
        where: { status: 'ACTIVE', deletedAt: null },
        include: { category: { select: { name: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}
