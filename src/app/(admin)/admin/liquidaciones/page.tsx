import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { formatPrice } from '@/lib/utils'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { formatAdminPeriodLabel, getSettlementStatusTone } from '@/domains/admin/overview'
import { SettlementActions } from '@/components/admin/SettlementActions'
import { getCommissionRate } from '@/domains/finance/commission'

export const metadata: Metadata = { title: 'Liquidaciones | Admin' }
export const revalidate = 30

export default async function AdminSettlementsPage() {
  const [settlements, totals] = await Promise.all([
    db.settlement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        vendor: { select: { displayName: true } },
      },
    }),
    db.settlement.aggregate({
      _sum: { grossSales: true, commissions: true, netPayable: true },
      _count: { _all: true },
    }),
  ])

  const settlementRates = new Map(
    await Promise.all(
      settlements.map(async settlement => [
        settlement.id,
        await getCommissionRate(settlement.vendorId),
      ] as const)
    )
  )

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Finanzas</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Liquidaciones</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Control de periodos, comisiones y pagos a productor.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Liquidaciones</p>
          <p className="mt-2 text-3xl font-bold text-[var(--foreground)]">{totals._count._all}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Ventas brutas</p>
          <p className="mt-2 text-3xl font-bold text-[var(--foreground)]">{formatPrice(Number(totals._sum.grossSales ?? 0))}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Comisiones</p>
          <p className="mt-2 text-3xl font-bold text-[var(--foreground)]">{formatPrice(Number(totals._sum.commissions ?? 0))}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Neto pagable</p>
          <p className="mt-2 text-3xl font-bold text-[var(--foreground)]">{formatPrice(Number(totals._sum.netPayable ?? 0))}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {settlements.map(settlement => (
          <div key={settlement.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">{settlement.vendor.displayName}</h2>
                <p className="text-sm text-[var(--muted)]">
                  {formatAdminPeriodLabel(settlement.periodFrom, settlement.periodTo)}
                </p>
              </div>
              <AdminStatusBadge
                label={settlement.status}
                tone={getSettlementStatusTone(settlement.status)}
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Ventas</p>
                <p className="mt-1 font-medium text-[var(--foreground)]">{formatPrice(Number(settlement.grossSales))}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Comisiones</p>
                <p className="mt-1 font-medium text-[var(--foreground)]">{formatPrice(Number(settlement.commissions))}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Regla actual {(settlementRates.get(settlement.id) ?? 0).toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Refunds</p>
                <p className="mt-1 font-medium text-[var(--foreground)]">{formatPrice(Number(settlement.refunds))}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Neto</p>
                <p className="mt-1 font-semibold text-[var(--foreground)]">{formatPrice(Number(settlement.netPayable))}</p>
              </div>
            </div>
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <SettlementActions settlementId={settlement.id} status={settlement.status} />
            </div>
          </div>
        ))}
        {settlements.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
            Todavia no hay liquidaciones calculadas.
          </p>
        )}
      </div>
    </div>
  )
}
