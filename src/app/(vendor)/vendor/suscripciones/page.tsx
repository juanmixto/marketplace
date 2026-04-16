import type { Metadata } from 'next'
import {
  getMyMonthlyChurnStats,
  listMySubscriptionPlans,
} from '@/domains/subscriptions/actions'
import { VendorSubscriptionPlansListClient } from '@/components/vendor/VendorSubscriptionPlansListClient'

export const metadata: Metadata = { title: 'Suscripciones' }

export default async function VendorSubscriptionsPage() {
  const [plans, churn] = await Promise.all([
    listMySubscriptionPlans('all'),
    getMyMonthlyChurnStats(),
  ])
  return <VendorSubscriptionPlansListClient plans={plans} churn={churn} />
}
