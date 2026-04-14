import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCategories } from '@/domains/catalog/queries'
import { getMyProducts } from '@/domains/vendors/actions'
import { getMyPromotion } from '@/domains/promotions/actions'
import { PromotionForm } from '@/components/vendor/PromotionForm'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = { title: 'Editar promoción' }

export default async function EditPromotionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [promotion, products, categories, t] = await Promise.all([
    getMyPromotion(id),
    getMyProducts(),
    getCategories(),
    getServerT(),
  ])

  if (!promotion) notFound()

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          {t('vendor.promotions.editPageTitle')}
        </h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          {t('vendor.promotions.editPageSubtitle')}
        </p>
      </div>
      <PromotionForm
        products={products.map(p => ({ id: p.id, name: p.name, status: p.status }))}
        categories={categories.map(c => ({ id: c.id, name: c.name }))}
        initial={promotion}
      />
    </div>
  )
}
