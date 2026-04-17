import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getMyProduct, getMyVendorProfile } from '@/domains/vendors/actions'
import { getActivePromotionsForProduct } from '@/domains/promotions/public'
import { VendorProductPreview } from '@/components/vendor/VendorProductPreview'

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = {
  title: 'Vista previa del producto',
  robots: { index: false, follow: false },
}

export default async function VendorProductPreviewPage({ params }: Props) {
  const { id } = await params
  const [product, vendor] = await Promise.all([
    getMyProduct(id),
    getMyVendorProfile(),
  ])
  if (!product) notFound()

  const activePromotions = await getActivePromotionsForProduct({
    productId: product.id,
    vendorId: product.vendorId,
    categoryId: product.categoryId,
  })

  return (
    <VendorProductPreview
      product={product}
      vendor={vendor}
      activePromotions={activePromotions}
    />
  )
}
