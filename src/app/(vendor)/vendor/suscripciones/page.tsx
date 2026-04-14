import type { Metadata } from 'next'
import { listMySubscriptionPlans } from '@/domains/subscriptions/actions'
import { VendorSubscriptionPlansListClient } from '@/components/vendor/VendorSubscriptionPlansListClient'

export const metadata: Metadata = { title: 'Suscripciones' }

export default async function VendorSubscriptionsPage() {
  const plans = await listMySubscriptionPlans('all')
  return <VendorSubscriptionPlansListClient plans={plans} />
}
