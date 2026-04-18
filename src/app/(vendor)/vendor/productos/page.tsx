import { getMyProducts } from '@/domains/vendors/actions'
import { VendorProductListClient } from '@/components/vendor/VendorProductListClient'
import type { Metadata } from 'next'
import { serializeVendorCatalogItem } from '@/lib/vendor-serialization'

export const metadata: Metadata = { title: 'Mi catálogo' }

export default async function VendorProductosPage() {
  const products = await getMyProducts()
  return <VendorProductListClient products={products.map(serializeVendorCatalogItem)} />
}
