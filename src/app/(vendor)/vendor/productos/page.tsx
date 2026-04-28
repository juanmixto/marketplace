import {
  getMyProductsPaginated,
  getMyProductAlerts,
  type VendorProductFilter,
} from '@/domains/vendors/actions'
import { VendorProductListClient } from '@/components/vendor/VendorProductListClient'
import type { Metadata } from 'next'
import { serializeVendorCatalogItem } from '@/lib/vendor-serialization'

export const metadata: Metadata = { title: 'Mi catálogo' }

const VALID_FILTERS: VendorProductFilter[] = [
  'all',
  'active',
  'draft',
  'pendingReview',
  'rejected',
  'outOfStock',
  'archived',
]

interface PageProps {
  searchParams: Promise<{
    cursor?: string
    filter?: string
    q?: string
  }>
}

export default async function VendorProductosPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {}
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined
  const q = typeof params.q === 'string' ? params.q.trim() : ''
  const filterParam = typeof params.filter === 'string' ? (params.filter as VendorProductFilter) : 'all'
  const filter = VALID_FILTERS.includes(filterParam) ? filterParam : 'all'

  const [page, alerts] = await Promise.all([
    getMyProductsPaginated({ cursor, filter, q: q || undefined }),
    getMyProductAlerts(),
  ])

  return (
    <VendorProductListClient
      products={page.items.map(serializeVendorCatalogItem)}
      alerts={alerts}
      filter={filter}
      query={q}
      hasNextPage={page.hasNextPage}
      nextCursor={page.nextCursor}
      isFirstPage={!cursor}
    />
  )
}
