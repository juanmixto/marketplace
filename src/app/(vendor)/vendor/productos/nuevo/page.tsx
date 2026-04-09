import { getCategories } from '@/domains/catalog/queries'
import { ProductForm } from '@/components/vendor/ProductForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Nuevo producto' }

export default async function NuevoProductoPage() {
  const categories = await getCategories()
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nuevo producto</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Guarda como borrador y envía a revisión cuando esté listo.
        </p>
      </div>
      <ProductForm categories={categories} />
    </div>
  )
}
