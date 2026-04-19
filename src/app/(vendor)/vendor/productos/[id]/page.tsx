import { getMyProduct } from '@/domains/vendors/actions'
import { getCategories } from '@/domains/catalog/queries'
import { ProductForm } from '@/components/vendor/ProductForm'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getServerT } from '@/i18n/server'
import { serializeVendorProductForm } from '@/lib/vendor-serialization'

interface Props { params: Promise<{ id: string }> }
export const metadata: Metadata = { title: 'Editar producto' }

export default async function EditProductoPage({ params }: Props) {
  const { id } = await params
  const [product, categories, t] = await Promise.all([
    getMyProduct(id),
    getCategories(),
    getServerT(),
  ])
  if (!product) notFound()

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('vendor.editProduct.title')}</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">{product.name}</p>
      </div>
      <ProductForm categories={categories} initialData={serializeVendorProductForm(product)} />
    </div>
  )
}
