import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { getMyVendorProfile } from '@/domains/vendors/actions'
import { SubscriptionPlanForm } from '@/components/vendor/SubscriptionPlanForm'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = { title: 'Nuevo plan de suscripción' }

export default async function NewSubscriptionPlanPage() {
  const [vendor, t] = await Promise.all([getMyVendorProfile(), getServerT()])

  // Eligible products: active, not soft-deleted, and not already linked to
  // a non-archived subscription plan. The @@unique on productId means that
  // attaching a plan to a product that already has one would fail anyway
  // — listing only eligible products makes the UX friendlier.
  const products = await db.product.findMany({
    where: {
      vendorId: vendor.id,
      deletedAt: null,
      status: 'ACTIVE',
      subscriptionPlan: { is: null },
    },
    select: { id: true, name: true, basePrice: true, unit: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          {t('vendor.subscriptionPlans.newPageTitle')}
        </h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          {t('vendor.subscriptionPlans.newPageSubtitle')}
        </p>
      </div>
      <SubscriptionPlanForm
        products={products.map(p => ({
          id: p.id,
          name: p.name,
          basePrice: Number(p.basePrice),
          unit: p.unit,
        }))}
      />
    </div>
  )
}
