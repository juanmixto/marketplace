import type { Metadata } from 'next'
import { AdminProducersClient } from '@/components/admin/AdminProducersClient'
import {
  getProducersOverview,
  PRODUCER_SORT_KEYS,
  PRODUCER_STATUS_FILTERS,
  type ProducerSortKey,
  type ProducerStatusFilter,
} from '@/domains/admin/producers'

export const metadata: Metadata = { title: 'Productores | Admin' }
export const revalidate = 30

interface PageProps {
  searchParams: Promise<{
    page?: string
    q?: string
    status?: string
    sort?: string
  }>
}

export default async function AdminVendorsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const pageNum = Number(sp.page)
  const statusCandidate = sp.status as ProducerStatusFilter | undefined
  const sortCandidate = sp.sort as ProducerSortKey | undefined
  const data = await getProducersOverview({
    page: Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : 1,
    search: sp.q ?? '',
    status: PRODUCER_STATUS_FILTERS.includes(statusCandidate as ProducerStatusFilter)
      ? statusCandidate
      : undefined,
    sort: PRODUCER_SORT_KEYS.includes(sortCandidate as ProducerSortKey)
      ? sortCandidate
      : undefined,
  })
  return <AdminProducersClient data={data} />
}
