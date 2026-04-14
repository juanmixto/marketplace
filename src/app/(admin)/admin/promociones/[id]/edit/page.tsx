import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireCatalogAdmin } from '@/lib/auth-guard'
import { getCategories } from '@/domains/catalog/queries'
import { AdminPromotionEditForm } from '@/components/admin/AdminPromotionEditForm'

export const metadata: Metadata = { title: 'Editar promoción | Admin' }
export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ id: string }> }

export default async function AdminPromotionEditPage({ params }: Props) {
  await requireCatalogAdmin()
  const { id } = await params

  const promotion = await db.promotion.findUnique({
    where: { id },
    include: { vendor: { select: { id: true, displayName: true } } },
  })
  if (!promotion) notFound()

  const [vendorProducts, categories] = await Promise.all([
    db.product.findMany({
      where: { vendorId: promotion.vendorId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    getCategories(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/promociones" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← Volver a promociones
        </Link>
        <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">Promociones · Edición admin</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{promotion.name}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Productor: <span className="font-medium text-[var(--foreground)]">{promotion.vendor.displayName}</span>
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <AdminPromotionEditForm
          promotion={{
            id: promotion.id,
            name: promotion.name,
            code: promotion.code,
            kind: promotion.kind,
            value: Number(promotion.value),
            scope: promotion.scope,
            productId: promotion.productId,
            categoryId: promotion.categoryId,
            minSubtotal: promotion.minSubtotal == null ? null : Number(promotion.minSubtotal),
            maxRedemptions: promotion.maxRedemptions,
            perUserLimit: promotion.perUserLimit,
            startsAt: promotion.startsAt.toISOString(),
            endsAt: promotion.endsAt.toISOString(),
          }}
          vendorProducts={vendorProducts.map(p => ({ id: p.id, label: p.name }))}
          categories={categories.map(c => ({ id: c.id, label: c.name }))}
        />
      </div>
    </div>
  )
}
