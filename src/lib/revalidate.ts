import { revalidatePath, updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache-tags'

export function safeRevalidatePath(path: string) {
  if (process.env.NODE_ENV === 'test') return
  revalidatePath(path)
}

export function safeRevalidateTag(tag: string) {
  if (process.env.NODE_ENV === 'test') return
  updateTag(tag)
}

export interface RevalidateCatalogInput {
  productSlug?: string | null
  vendorSlug?: string | null
  categorySlug?: string | null
  includeHome?: boolean
  /**
   * When true, flush the coarse `catalog`/`products`/`vendors`/
   * `categories` buckets in addition to any fine-grained tags. Leave
   * false when you know exactly one entity changed — you get the same
   * visible effect with far less cache churn across unrelated pages.
   */
  flushAll?: boolean
}

export function revalidateCatalogExperience(input: RevalidateCatalogInput = {}) {
  const { productSlug, vendorSlug, categorySlug, flushAll = true } = input

  if (productSlug) {
    safeRevalidateTag(CACHE_TAGS.product(productSlug))
    safeRevalidatePath(`/productos/${productSlug}`)
  }
  if (vendorSlug) {
    safeRevalidateTag(CACHE_TAGS.vendor(vendorSlug))
    safeRevalidatePath(`/productores/${vendorSlug}`)
  }
  if (categorySlug) {
    safeRevalidateTag(CACHE_TAGS.category(categorySlug))
  }

  if (flushAll) {
    safeRevalidateTag(CACHE_TAGS.catalog)
    safeRevalidateTag(CACHE_TAGS.products)
    safeRevalidateTag(CACHE_TAGS.vendors)
    safeRevalidateTag(CACHE_TAGS.categories)
    safeRevalidatePath('/productos')
    safeRevalidatePath('/productores')
  }

  if (input.includeHome ?? true) {
    safeRevalidateTag(CACHE_TAGS.home)
    safeRevalidatePath('/')
  }
}
