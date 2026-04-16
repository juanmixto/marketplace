import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { getMyVendorProfile } from '@/domains/vendors/actions'
import { SubscriptionPlanForm } from '@/components/vendor/SubscriptionPlanForm'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = { title: 'Nuevo plan de suscripción' }

export default async function NewSubscriptionPlanPage() {
  const [vendor, t] = await Promise.all([getMyVendorProfile(), getServerT()])

  // Multi-cadence (phase 4b-β follow-up): a product can have up to one
  // plan per cadence (WEEKLY / BIWEEKLY / MONTHLY). We list every
  // ACTIVE product — the vendor may want to publish a biweekly plan
  // alongside an existing weekly one. For each product we also load
  // which cadences it ALREADY has so the form can dim rows / disable
  // buttons instead of letting the vendor hit the generic duplicate
  // error on submit.
  const [products, existingPlans] = await Promise.all([
    db.product.findMany({
      where: {
        vendorId: vendor.id,
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: { id: true, name: true, basePrice: true, unit: true, status: true },
      orderBy: { name: 'asc' },
    }),
    db.subscriptionPlan.findMany({
      where: { vendorId: vendor.id, archivedAt: null },
      select: { productId: true, cadence: true },
    }),
  ])

  const takenCadencesByProduct: Record<string, ('WEEKLY' | 'BIWEEKLY' | 'MONTHLY')[]> = {}
  for (const plan of existingPlans) {
    const list = takenCadencesByProduct[plan.productId] ?? []
    list.push(plan.cadence)
    takenCadencesByProduct[plan.productId] = list
  }

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
          status: p.status,
        }))}
        takenCadencesByProduct={takenCadencesByProduct}
      />
    </div>
  )
}
