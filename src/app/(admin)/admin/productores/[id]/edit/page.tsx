import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireSuperadmin } from '@/lib/auth-guard'
import { AdminVendorEditForm } from '@/components/admin/AdminVendorEditForm'

export const metadata: Metadata = { title: 'Editar productor | Admin' }
export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ id: string }> }

export default async function AdminVendorEditPage({ params }: Props) {
  await requireSuperadmin()
  const { id } = await params

  const vendor = await db.vendor.findUnique({ where: { id } })
  if (!vendor) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/productores" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← Volver al listado
        </Link>
        <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">Productores · Edición admin</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{vendor.displayName}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Sólo SUPERADMIN puede editar estos datos — afectan facturación y comisiones.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <AdminVendorEditForm
          vendor={{
            id: vendor.id,
            displayName: vendor.displayName,
            slug: vendor.slug,
            description: vendor.description,
            location: vendor.location,
            status: vendor.status,
            commissionRate: Number(vendor.commissionRate),
          }}
        />
      </div>
    </div>
  )
}
