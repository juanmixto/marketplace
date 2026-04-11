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
  | 'basePrice'
  | 'compareAtPrice'
  | 'stock'
  | 'trackStock'
  | 'unit'
  | 'certifications'
  | 'originRegion'
  | 'createdAt'
>

export type ProductWithVendor = ProductCardFields & {
  vendor: Pick<Vendor, 'slug' | 'displayName' | 'location'>
  category: Pick<Category, 'name' | 'slug'> | null
}

export type ProductDetail = Product & {
  vendor: Pick<Vendor, 'slug' | 'displayName' | 'description' | 'location' | 'logo' | 'avgRating' | 'totalReviews'>
  category: Pick<Category, 'name' | 'slug'> | null
  variants: ProductVariant[]
}

export type VendorWithCount = Vendor & {
  _count: { products: number }
}

export type CategoryWithCount = Category & {
  _count: { products: number }
}

export type ProductSort = 'price_asc' | 'price_desc' | 'newest' | 'popular'

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

export function parseProductSort(value?: string): ProductSort {
  switch (value) {
    case 'price_asc':
    case 'price_desc':
    case 'popular':
      return value
    default:
      return 'newest'
  }
}
