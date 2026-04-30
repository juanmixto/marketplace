import type { ProductCardProduct } from '@/components/catalog/ProductCard'
import type { ProductWithVendor } from '@/domains/catalog'

export function serializeProductForCard(product: ProductWithVendor): ProductCardProduct {
  return {
    id: product.id,
    vendorId: product.vendorId,
    slug: product.slug,
    name: product.name,
    images: [...product.images],
    imageAlts: [...product.imageAlts],
    basePrice: Number(product.basePrice),
    compareAtPrice: product.compareAtPrice == null ? null : Number(product.compareAtPrice),
    stock: product.stock,
    trackStock: product.trackStock,
    unit: product.unit,
    certifications: [...product.certifications],
    originRegion: product.originRegion,
    vendor: product.vendor
      ? {
          slug: product.vendor.slug,
          displayName: product.vendor.displayName,
          location: product.vendor.location,
        }
      : undefined,
    category: product.category
      ? {
          name: product.category.name,
          slug: product.category.slug,
        }
      : null,
    variants: product.variants?.map(variant => ({
      id: variant.id,
      name: variant.name,
      priceModifier: Number(variant.priceModifier),
      stock: variant.stock,
      isActive: variant.isActive,
    })),
  }
}
