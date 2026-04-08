import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { formatDate, formatPrice } from '@/lib/utils'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { getIncidentStatusTone } from '@/domains/admin/overview'

export const metadata: Metadata = { title: 'Incidencias | Admin' }
export const revalidate = 30

export default async function AdminIncidentsPage() {
  const incidents = await db.incident.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      customer: { select: { firstName: true, lastName: true } },
      order: { select: { orderNumber: true } },
      messages: { select: { id: true } },
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Soporte</p>
        <h1 className="text-2xl font-bold text-gray-900">Incidencias</h1>
        <p className="mt-1 text-sm text-gray-500">Reclamaciones abiertas, SLA y resoluciones aplicadas.</p>
      </div>

      <div className="space-y-4">
        {incidents.map(incident => (
          <div key={incident.id} className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">{incident.type}</h2>
                  <AdminStatusBadge
                    label={incident.status}
                    tone={getIncidentStatusTone(incident.status)}
                  />
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {incident.order.orderNumber} · {incident.customer.firstName} {incident.customer.lastName}
                </p>
              </div>
              <div className="text-right text-sm text-gray-500">
                <p>Creada {formatDate(incident.createdAt)}</p>
                <p>SLA {formatDate(incident.slaDeadline)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-gray-700">{incident.description}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Mensajes</p>
                <p className="mt-1 font-medium text-gray-900">{incident.messages.length}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Resolucion</p>
                <p className="mt-1 font-medium text-gray-900">{incident.resolution ?? 'Pendiente'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Reembolso</p>
                <p className="mt-1 font-medium text-gray-900">
                  {incident.refundAmount ? formatPrice(Number(incident.refundAmount)) : 'No aplica'}
                </p>
              </div>
            </div>
          </div>
        ))}
        {incidents.length === 0 && (
          <p className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            No hay incidencias registradas.
          </p>
        )}
      </div>
    </div>
  )
}
