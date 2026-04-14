import type { Metadata } from 'next'
import { requireAuth } from '@/lib/auth-guard'
import { listMySubscriptions } from '@/domains/subscriptions/buyer-actions'
import { BuyerSubscriptionsListClient } from '@/components/buyer/BuyerSubscriptionsListClient'
import { getServerEnv } from '@/lib/env'

export const metadata: Metadata = { title: 'Mis suscripciones' }

export default async function BuyerSubscriptionsPage() {
  await requireAuth()
  const subscriptions = await listMySubscriptions('all')
  const betaEnabled = getServerEnv().subscriptionsBuyerBeta

  return (
    <BuyerSubscriptionsListClient
      subscriptions={subscriptions}
      betaEnabled={betaEnabled}
    />
  )
}
