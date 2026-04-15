import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-guard'
import {
  confirmMockSubscriptionCheckout,
  listMySubscriptions,
} from '@/domains/subscriptions/buyer-actions'
import { BuyerSubscriptionsListClient } from '@/components/buyer/BuyerSubscriptionsListClient'
import { getServerEnv } from '@/lib/env'

export const metadata: Metadata = { title: 'Mis suscripciones' }

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function BuyerSubscriptionsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  await requireAuth()
  const params = (await searchParams) ?? {}

  const checkout = firstValue(params.checkout)
  const mockSession = firstValue(params.mock_session)
  const planId = firstValue(params.planId)
  const addressId = firstValue(params.addressId)

  // Mock-mode checkout return flow: finalize the subscription, then
  // redirect to a clean URL so refresh is idempotent and the success
  // banner shows via a single `welcome` flag.
  if (checkout === 'success' && mockSession && planId && addressId) {
    const result = await confirmMockSubscriptionCheckout({
      sessionId: mockSession,
      planId,
      addressId,
    })
    if (result.ok) {
      redirect('/cuenta/suscripciones?welcome=1')
    }
    redirect(`/cuenta/suscripciones?welcome=error&reason=${result.reason ?? 'unknown'}`)
  }

  const subscriptions = await listMySubscriptions('all')
  const betaEnabled = getServerEnv().subscriptionsBuyerBeta

  const welcome = firstValue(params.welcome)
  const welcomeState =
    welcome === '1' ? 'success' :
    welcome === 'error' ? 'error' :
    checkout === 'success' ? 'success' :
    null

  return (
    <BuyerSubscriptionsListClient
      subscriptions={subscriptions}
      betaEnabled={betaEnabled}
      welcomeState={welcomeState}
    />
  )
}
