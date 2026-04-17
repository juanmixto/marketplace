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
  const productIdParam = firstValue(params.productId)
  const planIdParam = firstValue(params.planId)

  // Resolve which product to show. We accept either ?productId (preferred
  // entry point from the product page CTA) or ?planId (legacy — the
  // first iteration of the subscribe flow linked directly to a plan).
  // From either, we load ALL active plans for that product so the form
  // can render a cadence selector.
  let productId: string | null = null
  if (productIdParam) {
    productId = productIdParam
  } else if (planIdParam) {
    const seed = await db.subscriptionPlan.findUnique({
      where: { id: planIdParam },
      select: { productId: true },
    })
    productId = seed?.productId ?? null
  }
  if (!productId) notFound()

  const plans = await db.subscriptionPlan.findMany({
    where: {
      productId,
      archivedAt: null,
      stripePriceId: { not: null },
    },
    orderBy: { cadence: 'asc' },
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
  if (plans.length === 0) notFound()
  const sample = plans[0]!
  if (sample.product.status !== 'ACTIVE' || sample.product.deletedAt) {
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

  const returnTo = `/cuenta/suscripciones/nueva?productId=${productId}`

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
            href={`/cuenta/direcciones?returnTo=${encodeURIComponent(returnTo)}`}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
          >
            Añadir dirección
          </Link>
          <Link
            href={`/productos/${sample.product.slug}`}
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
      product={{
        id: sample.product.id,
        name: sample.product.name,
        slug: sample.product.slug,
        unit: sample.product.unit,
        image: sample.product.images?.[0] ?? null,
      }}
      vendor={{
        displayName: sample.vendor.displayName,
        slug: sample.vendor.slug,
      }}
      plans={plans.map(p => ({
        id: p.id,
        cadence: p.cadence,
        priceSnapshot: Number(p.priceSnapshot),
        taxRateSnapshot: Number(p.taxRateSnapshot),
        cutoffDayOfWeek: p.cutoffDayOfWeek,
      }))}
      addresses={addresses}
      initialPlanId={planIdParam ?? null}
    />
  )
}
