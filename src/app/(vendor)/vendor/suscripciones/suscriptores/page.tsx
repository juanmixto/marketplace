import type { Metadata } from 'next'
import { listMySubscribers, listMySubscriptionPlans } from '@/domains/subscriptions/actions'
import { VendorSubscribersListClient } from '@/components/vendor/VendorSubscribersListClient'

export const metadata: Metadata = { title: 'Suscriptores' }

interface PageProps {
  searchParams: Promise<{ plan?: string }>
}

export default async function VendorSubscribersPage({ searchParams }: PageProps) {
  const { plan: planId } = await searchParams
  const [subscribers, plans] = await Promise.all([
    listMySubscribers(planId),
    listMySubscriptionPlans('active'),
  ])

  return (
    <VendorSubscribersListClient
      subscribers={subscribers}
      plans={plans}
      activePlanId={planId ?? null}
    />
  )
}
