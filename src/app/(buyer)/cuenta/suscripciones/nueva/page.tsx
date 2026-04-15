import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { NewSubscriptionForm } from '@/components/buyer/NewSubscriptionForm'

export const metadata: Metadata = { title: 'Confirmar suscripción' }

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function NewSubscriptionPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const session = await requireAuth()
  const params = (await searchParams) ?? {}
  const planId = firstValue(params.planId)
  if (!planId) notFound()

  const plan = await db.subscriptionPlan.findFirst({
    where: { id: planId, archivedAt: null },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          unit: true,
          images: true,
          status: true,
          deletedAt: true,
        },
      },
      vendor: { select: { id: true, slug: true, displayName: true } },
    },
  })
  if (!plan || plan.product.status !== 'ACTIVE' || plan.product.deletedAt) {
    notFound()
  }

  const addresses = await db.address.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      label: true,
      firstName: true,
      lastName: true,
      line1: true,
      line2: true,
      city: true,
      province: true,
      postalCode: true,
      isDefault: true,
    },
  })

  if (addresses.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          Necesitas una dirección de envío
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Antes de suscribirte tienes que añadir una dirección a tu cuenta para
          que podamos enviarte las entregas recurrentes.
        </p>
        <div className="flex gap-3">
          <Link
            href={`/cuenta/direcciones?returnTo=${encodeURIComponent(
              `/cuenta/suscripciones/nueva?planId=${plan.id}`,
            )}`}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
          >
            Añadir dirección
          </Link>
          <Link
            href={`/productos/${plan.product.slug}`}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]"
          >
            Volver al producto
          </Link>
        </div>
      </div>
    )
  }

  return (
    <NewSubscriptionForm
      plan={{
        id: plan.id,
        cadence: plan.cadence,
        priceSnapshot: Number(plan.priceSnapshot),
        taxRateSnapshot: Number(plan.taxRateSnapshot),
        cutoffDayOfWeek: plan.cutoffDayOfWeek,
        product: {
          name: plan.product.name,
          slug: plan.product.slug,
          unit: plan.product.unit,
          image: plan.product.images?.[0] ?? null,
        },
        vendor: {
          displayName: plan.vendor.displayName,
          slug: plan.vendor.slug,
        },
      }}
      addresses={addresses}
    />
  )
}
