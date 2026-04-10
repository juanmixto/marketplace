import { revalidatePath, revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache-tags'

export function safeRevalidatePath(path: string) {
  if (process.env.NODE_ENV === 'test') return
  revalidatePath(path)
}

export function safeRevalidateTag(tag: string) {
  if (process.env.NODE_ENV === 'test') return
  revalidateTag(tag, 'max')
}

export function revalidateCatalogExperience(input: {
  productSlug?: string | null
  vendorSlug?: string | null
  includeHome?: boolean
} = {}) {
  safeRevalidateTag(CACHE_TAGS.catalog)
  safeRevalidateTag(CACHE_TAGS.products)
  safeRevalidateTag(CACHE_TAGS.vendors)
  safeRevalidateTag(CACHE_TAGS.categories)

  safeRevalidatePath('/productos')
  safeRevalidatePath('/productores')

  if (input.productSlug) {
    safeRevalidatePath(`/productos/${input.productSlug}`)
  }

  if (input.vendorSlug) {
    safeRevalidatePath(`/productores/${input.vendorSlug}`)
  }

  if (input.includeHome ?? true) {
    safeRevalidateTag(CACHE_TAGS.home)
    safeRevalidatePath('/')
  }
}
