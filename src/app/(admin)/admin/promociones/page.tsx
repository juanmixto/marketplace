import type { Metadata } from 'next'
import { getPromotionsOverview } from '@/domains/admin/promotions'
import { AdminPromotionsClient } from '@/components/admin/AdminPromotionsClient'

export const metadata: Metadata = { title: 'Promociones | Admin' }
export const revalidate = 30

export default async function AdminPromotionsPage() {
  const data = await getPromotionsOverview()
  return <AdminPromotionsClient data={data} />
}
