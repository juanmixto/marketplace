import type { Metadata } from 'next'
import { getCategories } from '@/domains/catalog/queries'
import { getMyProducts } from '@/domains/vendors/actions'
import { PromotionForm } from '@/components/vendor/PromotionForm'
import { getServerT } from '@/i18n/server'
import { createIdempotencyToken } from '@/lib/idempotency'

export const metadata: Metadata = { title: 'Nueva promoción' }

// force-dynamic mirrors the checkout page (#410) and the new-product
// page (#788 PR-A). Without it, a stale idempotencyToken could be
// served from the route cache, defeating the protection.
export const dynamic = 'force-dynamic'

export default async function NewPromotionPage() {
  const [products, categories, t] = await Promise.all([
    getMyProducts(),
    getCategories(),
    getServerT(),
  ])
  const idempotencyToken = createIdempotencyToken()

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          {t('vendor.promotions.newPageTitle')}
        </h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          {t('vendor.promotions.newPageSubtitle')}
        </p>
      </div>
      <PromotionForm
        products={products.map(p => ({ id: p.id, name: p.name, status: p.status }))}
        categories={categories.map(c => ({ id: c.id, name: c.name }))}
        idempotencyToken={idempotencyToken}
      />
    </div>
  )
}
