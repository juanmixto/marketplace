import type { Metadata } from 'next'
import { getSubscriptionsOverview } from '@/domains/admin/subscriptions'
import { AdminSubscriptionsClient } from '@/components/admin/AdminSubscriptionsClient'

export const metadata: Metadata = { title: 'Suscripciones | Admin' }
export const revalidate = 30

export default async function AdminSubscriptionsPage() {
  const data = await getSubscriptionsOverview()
  return <AdminSubscriptionsClient data={data} />
}
