import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getMySubscriptionPlan } from '@/domains/subscriptions/actions'
import { SubscriptionPlanForm } from '@/components/vendor/SubscriptionPlanForm'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = { title: 'Editar plan de suscripción' }

export default async function EditSubscriptionPlanPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [plan, t] = await Promise.all([getMySubscriptionPlan(id), getServerT()])

  if (!plan) notFound()

  // We only need the product row linked to the plan (product + cadence are
  // locked in edit mode, so there's no need to load the eligible-products
  // list the create flow uses).
  const product = await db.product.findFirst({
    where: { id: plan.productId },
    select: { id: true, name: true, basePrice: true, unit: true, status: true },
  })

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          {t('vendor.subscriptionPlans.editPageTitle')}
        </h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          {t('vendor.subscriptionPlans.editPageSubtitle')}
        </p>
      </div>
      <SubscriptionPlanForm
        products={
          product
            ? [
                {
                  id: product.id,
                  name: product.name,
                  basePrice: Number(product.basePrice),
                  unit: product.unit,
                  status: product.status,
                },
              ]
            : []
        }
        initial={{
          id: plan.id,
          productId: plan.productId,
          productName: product?.name ?? plan.product.name,
          productUnit: product?.unit ?? 'ud',
          priceSnapshot: Number(plan.priceSnapshot),
          cadence: plan.cadence,
          cutoffDayOfWeek: plan.cutoffDayOfWeek,
        }}
      />
    </div>
  )
}
