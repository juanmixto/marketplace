import type { VariantProps } from 'class-variance-authority'
import type { Product, Vendor, Category, ProductVariant } from '@/generated/prisma/client'
import type { badgeVariants } from '@/components/ui/badge'

type ProductCardFields = Pick<
  Product,
  | 'id'
  | 'vendorId'
  | 'slug'
  | 'name'
  | 'images'
  | 'imageAlts'
  | 'basePrice'
  | 'compareAtPrice'
  | 'stock'
  | 'trackStock'
  | 'unit'
  | 'certifications'
  | 'originRegion'
  | 'createdAt'
>

type ProductCardVariantFields = Pick<ProductVariant, 'id' | 'name' | 'priceModifier' | 'stock' | 'isActive'>

export type ProductWithVendor = ProductCardFields & {
  vendor: Pick<Vendor, 'slug' | 'displayName' | 'location'>
  category: Pick<Category, 'name' | 'slug'> | null
  variants?: ProductCardVariantFields[]
  /** #324 — enriched by catalog query via a single Review.groupBy call. */
  averageRating?: number | null
  totalReviews?: number
}

export type ProductDetail = Product & {
  vendor: Pick<Vendor, 'slug' | 'displayName' | 'description' | 'location' | 'logo' | 'avgRating' | 'totalReviews'>
  category: Pick<Category, 'name' | 'slug'> | null
  variants: ProductVariant[]
}

// Public-vendor shape (#590). Must stay in sync with
// PUBLIC_VENDOR_SELECT in src/domains/catalog/queries.ts — that
// constant defines which fields are safe to expose on public reads.
export type PublicVendor = Pick<
  Vendor,
  | 'id'
  | 'slug'
  | 'displayName'
  | 'description'
  | 'logo'
  | 'logoAlt'
  | 'coverImage'
  | 'coverImageAlt'
  | 'location'
  | 'category'
  | 'avgRating'
  | 'totalReviews'
  | 'orderCutoffTime'
  | 'preparationDays'
  | 'createdAt'
>

export type VendorWithCount = PublicVendor & {
  _count: { products: number }
}

export type CategoryWithCount = Category & {
  _count: { products: number }
}

/**
 * The rule every catalog-facing surface (home grid, filter sidebar,
 * header dropdown, search overlay) uses to hide dead-end branches:
 * a category is visible when at least one product still counts as
 * publicly available (see `getAvailableProductWhere`).
 *
 * Centralized here so a new surface can't drift from the rule.
 */
export function isCategoryVisible(category: { _count: { products: number } }): boolean {
  return category._count.products > 0
}

export type ProductSort = 'price_asc' | 'price_desc' | 'newest' | 'popular' | 'top_rated'

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

export function parseProductSort(value?: string): ProductSort {
  switch (value) {
    case 'price_asc':
    case 'price_desc':
    case 'popular':
    case 'top_rated':
      return value
    default:
      return 'newest'
  }
}
