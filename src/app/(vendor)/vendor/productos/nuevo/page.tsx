import { getCategories } from '@/domains/catalog/queries'
import { getMyVendorProfile } from '@/domains/vendors/actions'
import { ProductForm } from '@/components/vendor/ProductForm'
import type { Metadata } from 'next'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = { title: 'Nuevo producto' }

export default async function NuevoProductoPage() {
  const [categories, vendor, t] = await Promise.all([
    getCategories(),
    getMyVendorProfile(),
    getServerT(),
  ])
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('vendor.newProduct.title')}</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          {t('vendor.newProduct.subtitle')}
        </p>
      </div>
      <ProductForm categories={categories} stripeOnboarded={vendor.stripeOnboarded} />
    </div>
  )
}
