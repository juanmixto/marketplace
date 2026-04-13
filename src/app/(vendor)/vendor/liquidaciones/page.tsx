import { Metadata } from 'next'
import { requireVendor } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { format, nextMonday } from 'date-fns'
import { es } from 'date-fns/locale'

export const metadata: Metadata = {
  title: 'Liquidaciones | Portal Productor',
  description: 'Ver tus liquidaciones y pagos semanales',
}

const formatEUR = (amount: any | null) =>
  amount
    ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(amount))
    : '—'

const statusBadge = (status: string) => {
  const config: Record<string, { classes: string; label: string }> = {
    DRAFT: {
      classes: 'bg-gray-100 text-gray-800 dark:bg-slate-800/60 dark:text-slate-300',
      label: 'Borrador',
    },
    PENDING_APPROVAL: {
      classes: 'bg-yellow-100 text-yellow-800 dark:bg-amber-950/40 dark:text-amber-300',
      label: 'Pendiente aprobación',
    },
    APPROVED: {
      classes: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
      label: 'Aprobada',
    },
    PAID: {
      classes: 'bg-green-100 text-green-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      label: 'Pagada',
    },
  }
  const info = config[status] || {
    classes: 'bg-gray-100 text-gray-800 dark:bg-slate-800/60 dark:text-slate-300',
    label: status,
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${info.classes}`}>
      {info.label}
    </span>
  )
}

export default async function Liquidaciones() {
  const { user } = await requireVendor()

  const vendor = await db.vendor.findUniqueOrThrow({
    where: { userId: user.id },
  })

  const [settlements, thisMonthData, pendingData] = await Promise.all([
    db.settlement.findMany({
      where: { vendorId: vendor.id },
      orderBy: { periodTo: 'desc' },
      take: 50,
    }),
    db.settlement.aggregate({
      where: {
        vendorId: vendor.id,
        status: 'PAID',
        paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
      _sum: { netPayable: true, commissions: true },
    }),
    db.settlement.aggregate({
      where: {
        vendorId: vendor.id,
        status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] },
      },
      _sum: { netPayable: true },
    }),
  ])

  const nextPaymentDay = format(nextMonday(new Date()), 'dd MMM yyyy', { locale: es })

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-[var(--foreground)]">Liquidaciones</h1>
        <p className="mt-2 text-gray-600 dark:text-[var(--muted)]">Historial de pagos semanales</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <p className="text-sm text-gray-600 dark:text-[var(--muted)]">Cobrado este mes</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatEUR(thisMonthData._sum.netPayable)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <p className="text-sm text-gray-600 dark:text-[var(--muted)]">Pendiente de liquidar</p>
          <p className="mt-2 text-3xl font-bold text-blue-600 dark:text-blue-400">
            {formatEUR(pendingData._sum.netPayable)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <p className="text-sm text-gray-600 dark:text-[var(--muted)]">Comisiones este mes</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-[var(--foreground)]">
            {formatEUR(thisMonthData._sum.commissions)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <p className="text-sm text-gray-600 dark:text-[var(--muted)]">Próxima liquidación</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-[var(--foreground)]">{nextPaymentDay}</p>
        </div>
      </div>

      {/* Table */}
      {settlements.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-[var(--border)] dark:bg-[var(--surface-raised)]">
          <p className="text-gray-600 dark:text-[var(--muted)]">
            Aún no tienes liquidaciones. Los pagos se procesan semanalmente cada lunes.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-[var(--border)]">
            <thead className="bg-gray-50 dark:bg-[var(--surface-raised)]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">Período</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  Ventas brutas
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  Comisiones
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  Reembolsos
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  Neto a cobrar
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  Fecha pago
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[var(--border)]">
              {settlements.map(settlement => (
                <tr key={settlement.id} className="hover:bg-gray-50 dark:hover:bg-[var(--surface-raised)]">
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-[var(--foreground)]">
                    {format(settlement.periodFrom, 'dd MMM', { locale: es })} —{' '}
                    {format(settlement.periodTo, 'dd MMM yyyy', { locale: es })}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-[var(--foreground)]">
                    {formatEUR(settlement.grossSales)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-[var(--foreground)]">
                    {formatEUR(settlement.commissions)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-[var(--foreground)]">
                    {formatEUR(settlement.refunds)}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatEUR(settlement.netPayable)}
                  </td>
                  <td className="px-6 py-4 text-sm">{statusBadge(settlement.status)}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-[var(--foreground)]">
                    {settlement.paidAt
                      ? format(settlement.paidAt, 'dd MMM yyyy', { locale: es })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
