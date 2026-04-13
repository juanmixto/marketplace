import type { Metadata } from 'next'
import { AdminProducersClient } from '@/components/admin/AdminProducersClient'
import { getProducersOverview } from '@/domains/admin/producers'

export const metadata: Metadata = { title: 'Productores | Admin' }
export const revalidate = 30

export default async function AdminVendorsPage() {
  const data = await getProducersOverview()
  return <AdminProducersClient data={data} />
}
