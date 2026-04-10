import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { VendorModerationActions } from '@/components/admin/VendorModerationActions'
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
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Catalogo</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Productores</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Alta, seguimiento y salud operativa de vendedores.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {vendorStats.map(stat => (
          <div key={stat.status} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{stat.status}</p>
            <p className="mt-2 text-3xl font-bold text-[var(--foreground)]">{stat._count._all}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {vendors.map(vendor => (
          <div key={vendor.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">{vendor.displayName}</h2>
                <p className="text-sm text-[var(--muted)]">{vendor.user.email}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <AdminStatusBadge label={vendor.status} tone={getVendorStatusTone(vendor.status)} />
                <VendorModerationActions vendorId={vendor.id} status={vendor.status} />
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Productos</p>
                <p className="mt-1 font-medium text-[var(--foreground)]">{vendor._count.products}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Ubicacion</p>
                <p className="mt-1 font-medium text-[var(--foreground)]">{vendor.location ?? 'Sin definir'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Onboarding Stripe</p>
                <p className="mt-1 font-medium text-[var(--foreground)]">{vendor.stripeOnboarded ? 'Completo' : 'Pendiente'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Alta</p>
                <p className="mt-1 font-medium text-[var(--foreground)]">{formatDate(vendor.createdAt)}</p>
              </div>
            </div>
            {vendor.description && (
              <p className="mt-4 line-clamp-3 text-sm text-[var(--foreground-soft)]">{vendor.description}</p>
            )}
          </div>
        ))}
        {vendors.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)] shadow-sm">
            Aun no hay productores creados.
          </p>
        )}
      </div>
    </div>
  )
}
