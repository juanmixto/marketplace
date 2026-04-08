import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { getVendorStatusTone } from '@/domains/admin/overview'

export const metadata: Metadata = { title: 'Productores | Admin' }
export const revalidate = 30

export default async function AdminVendorsPage() {
  const [vendors, vendorStats] = await Promise.all([
    db.vendor.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true } },
        _count: { select: { products: true } },
      },
    }),
    db.vendor.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Catalogo</p>
        <h1 className="text-2xl font-bold text-gray-900">Productores</h1>
        <p className="mt-1 text-sm text-gray-500">Alta, seguimiento y salud operativa de vendedores.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {vendorStats.map(stat => (
          <div key={stat.status} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">{stat.status}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{stat._count._all}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {vendors.map(vendor => (
          <div key={vendor.id} className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{vendor.displayName}</h2>
                <p className="text-sm text-gray-500">{vendor.user.email}</p>
              </div>
              <AdminStatusBadge label={vendor.status} tone={getVendorStatusTone(vendor.status)} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Productos</p>
                <p className="mt-1 font-medium text-gray-900">{vendor._count.products}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Ubicacion</p>
                <p className="mt-1 font-medium text-gray-900">{vendor.location ?? 'Sin definir'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Onboarding Stripe</p>
                <p className="mt-1 font-medium text-gray-900">{vendor.stripeOnboarded ? 'Completo' : 'Pendiente'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Alta</p>
                <p className="mt-1 font-medium text-gray-900">{formatDate(vendor.createdAt)}</p>
              </div>
            </div>
            {vendor.description && (
              <p className="mt-4 line-clamp-3 text-sm text-gray-600">{vendor.description}</p>
            )}
          </div>
        ))}
        {vendors.length === 0 && (
          <p className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            Aun no hay productores creados.
          </p>
        )}
      </div>
    </div>
  )
}
