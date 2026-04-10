import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { formatPrice } from '@/lib/utils'

export const metadata: Metadata = { title: 'Informes | Admin' }
export const revalidate = 30

export default async function AdminReportsPage() {
  const [
    orderTotals,
    vendorTotals,
    productTotals,
    incidentTotals,
    paymentTotals,
  ] = await Promise.all([
    db.order.aggregate({
      _count: { _all: true },
      _sum: { grandTotal: true, shippingCost: true, taxAmount: true },
    }),
    db.vendor.aggregate({
      _count: { _all: true },
      _avg: { avgRating: true },
    }),
    db.product.aggregate({
      _count: { _all: true },
      _avg: { basePrice: true },
    }),
    db.incident.aggregate({
      _count: { _all: true },
      _sum: { refundAmount: true },
    }),
    db.payment.aggregate({
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ])

  const reportCards = [
    {
      label: 'GMV total',
      value: formatPrice(Number(orderTotals._sum.grandTotal ?? 0)),
      detail: `${orderTotals._count._all} pedidos`,
    },
    {
      label: 'Pagos procesados',
      value: formatPrice(Number(paymentTotals._sum.amount ?? 0)),
      detail: `${paymentTotals._count._all} pagos`,
    },
    {
      label: 'Productores',
      value: String(vendorTotals._count._all),
      detail: vendorTotals._avg.avgRating ? `${Number(vendorTotals._avg.avgRating).toFixed(1)}★ media` : 'Sin reviews',
    },
    {
      label: 'Catalogo',
      value: String(productTotals._count._all),
      detail: `Precio medio ${formatPrice(Number(productTotals._avg.basePrice ?? 0))}`,
    },
    {
      label: 'Incidencias',
      value: String(incidentTotals._count._all),
      detail: `Refunds ${formatPrice(Number(incidentTotals._sum.refundAmount ?? 0))}`,
    },
    {
      label: 'Impuestos cobrados',
      value: formatPrice(Number(orderTotals._sum.taxAmount ?? 0)),
      detail: `Envio ${formatPrice(Number(orderTotals._sum.shippingCost ?? 0))}`,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Analitica</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Informes</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Vista agregada del rendimiento operativo y financiero.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reportCards.map(card => (
          <div key={card.label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{card.label}</p>
            <p className="mt-3 text-3xl font-bold text-[var(--foreground)]">{card.value}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">{card.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
