import type { Product, Vendor, Category, ProductVariant } from '@/generated/prisma/client'

export type ProductWithVendor = Product & {
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
