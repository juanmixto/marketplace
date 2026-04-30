import type { getMyProduct, getMyProducts } from '@/domains/vendors'

export type VendorCatalogItem = {
  id: string
  slug: string
  name: string
  images: string[]
  imageAlts: string[]
  status: string
  stock: number
  trackStock: boolean
  basePrice: number
  unit: string
  expiresAt: Date | string | null
  archivedAt: Date | string | null
  rejectionNote: string | null
  originRegion: string | null
  category: { name: string } | null
  variants: { id: string }[]
}

export type VendorProductPreviewItem = {
  id: string
  slug: string
  name: string
  description: string | null
  images: string[]
  imageAlts: string[]
  certifications: string[]
  originRegion: string | null
  basePrice: number
  compareAtPrice: number | null
  unit: string
  trackStock: boolean
  stock: number
  status: string
  categoryId: string | null
  variants: { id: string; name: string; priceModifier: number; stock: number; isActive: boolean }[]
}

export type VendorProductFormItem = {
  id: string
  name: string
  description: string | null
  categoryId: string | null
  basePrice: number
  compareAtPrice: number | null
  taxRate: number
  unit: string
  stock: number
  trackStock: boolean
  weightGrams: number | null
  certifications: string[]
  originRegion: string | null
  images: string[]
  imageAlts: string[]
  expiresAt: Date | string | null
  status: 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'
  variants: { id: string; name: string; priceModifier: number; stock: number; isActive: boolean }[]
}

type MyProduct = NonNullable<Awaited<ReturnType<typeof getMyProduct>>>
type MyProductsProduct = Awaited<ReturnType<typeof getMyProducts>>[number]

export function serializeVendorCatalogItem(product: MyProductsProduct): VendorCatalogItem {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    images: [...product.images],
    imageAlts: [...product.imageAlts],
    status: product.status,
    stock: product.stock,
    trackStock: product.trackStock,
    basePrice: Number(product.basePrice),
    unit: product.unit,
    expiresAt: product.expiresAt,
    archivedAt: product.archivedAt,
    rejectionNote: product.rejectionNote,
    originRegion: product.originRegion,
    category: product.category ? { name: product.category.name } : null,
    variants: product.variants.map(variant => ({ id: variant.id })),
  }
}

export function serializeVendorProductPreview(product: MyProduct): VendorProductPreviewItem {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    images: [...product.images],
    imageAlts: [...product.imageAlts],
    certifications: [...product.certifications],
    originRegion: product.originRegion,
    basePrice: Number(product.basePrice),
    compareAtPrice: product.compareAtPrice == null ? null : Number(product.compareAtPrice),
    unit: product.unit,
    trackStock: product.trackStock,
    stock: product.stock,
    status: product.status,
    categoryId: product.categoryId,
    variants: product.variants.map(variant => ({
      id: variant.id,
      name: variant.name,
      priceModifier: Number(variant.priceModifier),
      stock: variant.stock,
      isActive: variant.isActive,
    })),
  }
}

export function serializeVendorProductForm(product: MyProduct): VendorProductFormItem {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    basePrice: Number(product.basePrice),
    compareAtPrice: product.compareAtPrice == null ? null : Number(product.compareAtPrice),
    taxRate: Number(product.taxRate),
    unit: product.unit,
    stock: product.stock,
    trackStock: product.trackStock,
    weightGrams: product.weightGrams == null ? null : Number(product.weightGrams),
    certifications: [...product.certifications],
    originRegion: product.originRegion,
    images: [...product.images],
    imageAlts: [...product.imageAlts],
    expiresAt: product.expiresAt,
    status: product.status,
    variants: product.variants.map(variant => ({
      id: variant.id,
      name: variant.name,
      priceModifier: Number(variant.priceModifier),
      stock: variant.stock,
      isActive: variant.isActive,
    })),
  }
}
