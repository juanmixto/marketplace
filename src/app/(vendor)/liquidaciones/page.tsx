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
  const config: Record<string, { bg: string; text: string; label: string }> = {
    DRAFT: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Borrador' },
    PENDING_APPROVAL: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      label: 'Pendiente aprobación',
    },
    APPROVED: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Aprobada' },
    PAID: { bg: 'bg-green-100', text: 'text-green-800', label: 'Pagada' },
  }
  const info = config[status] || { bg: 'bg-gray-100', text: 'text-gray-800', label: status }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${info.bg} ${info.text}`}>
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
        <h1 className="text-3xl font-bold text-gray-900">Liquidaciones</h1>
        <p className="mt-2 text-gray-600">Historial de pagos semanales</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600">Cobrado este mes</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">
            {formatEUR(thisMonthData._sum.netPayable)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600">Pendiente de liquidar</p>
          <p className="mt-2 text-3xl font-bold text-blue-600">
            {formatEUR(pendingData._sum.netPayable)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600">Comisiones este mes</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {formatEUR(thisMonthData._sum.commissions)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600">Próxima liquidación</p>
          <p className="mt-2 text-lg font-semibold text-gray-900">{nextPaymentDay}</p>
        </div>
      </div>

      {/* Table */}
      {settlements.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <p className="text-gray-600">
            Aún no tienes liquidaciones. Los pagos se procesan semanalmente cada lunes.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900">Período</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900">
                  Ventas brutas
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900">
                  Comisiones
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900">
                  Reembolsos
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900">
                  Neto a cobrar
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900">
                  Fecha pago
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {settlements.map(settlement => (
                <tr key={settlement.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {format(settlement.periodFrom, 'dd MMM', { locale: es })} —{' '}
                    {format(settlement.periodTo, 'dd MMM yyyy', { locale: es })}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {formatEUR(settlement.grossSales)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {formatEUR(settlement.commissions)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {formatEUR(settlement.refunds)}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-emerald-600">
                    {formatEUR(settlement.netPayable)}
                  </td>
                  <td className="px-6 py-4 text-sm">{statusBadge(settlement.status)}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
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
