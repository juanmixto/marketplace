import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireSuperadmin } from '@/lib/auth-guard'
import { AdminSubscriptionPlanEditForm } from '@/components/admin/AdminSubscriptionPlanEditForm'

export const metadata: Metadata = { title: 'Editar plan | Admin' }
export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ id: string }> }

export default async function AdminPlanEditPage({ params }: Props) {
  await requireSuperadmin()
  const { id } = await params

  const plan = await db.subscriptionPlan.findUnique({
    where: { id },
    include: {
      vendor: { select: { displayName: true } },
      product: { select: { name: true } },
    },
  })
  if (!plan) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/suscripciones" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← Volver a suscripciones
        </Link>
        <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">Suscripciones · Edición admin</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{plan.product.name}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Productor: <span className="font-medium text-[var(--foreground)]">{plan.vendor.displayName}</span>
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <AdminSubscriptionPlanEditForm
          plan={{
            id: plan.id,
            cadence: plan.cadence,
            priceSnapshot: Number(plan.priceSnapshot),
            taxRateSnapshot: Number(plan.taxRateSnapshot),
            cutoffDayOfWeek: plan.cutoffDayOfWeek,
            archived: plan.archivedAt != null,
          }}
        />
      </div>
    </div>
  )
}
