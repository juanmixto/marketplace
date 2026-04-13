import { getCategories } from '@/domains/catalog/queries'
import { getMyVendorProfile } from '@/domains/vendors/actions'
import { ProductForm } from '@/components/vendor/ProductForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Nuevo producto' }

export default async function NuevoProductoPage() {
  const [categories, vendor] = await Promise.all([getCategories(), getMyVendorProfile()])
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Nuevo producto</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          Guarda como borrador y envía a revisión cuando esté listo.
        </p>
      </div>
      <ProductForm categories={categories} stripeOnboarded={vendor.stripeOnboarded} />
    </div>
  )
}
