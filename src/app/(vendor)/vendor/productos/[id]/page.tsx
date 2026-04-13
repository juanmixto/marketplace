import { getMyProduct, getMyVendorProfile } from '@/domains/vendors/actions'
import { getCategories } from '@/domains/catalog/queries'
import { ProductForm } from '@/components/vendor/ProductForm'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

interface Props { params: Promise<{ id: string }> }
export const metadata: Metadata = { title: 'Editar producto' }

export default async function EditProductoPage({ params }: Props) {
  const { id } = await params
  const [product, categories, vendor] = await Promise.all([
    getMyProduct(id),
    getCategories(),
    getMyVendorProfile(),
  ])
  if (!product) notFound()

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Editar producto</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">{product.name}</p>
      </div>
      <ProductForm categories={categories} initialData={product} stripeOnboarded={vendor.stripeOnboarded} />
    </div>
  )
}
