import { CheckoutPageClient } from '@/components/buyer/CheckoutPageClient'
import { getShippingConfigurationSnapshot } from '@/domains/shipping/calculator'
import { generateCheckoutAttemptId } from '@/domains/orders/checkout-token'
import type { SavedCheckoutAddress } from '@/domains/orders/checkout'
import { getServerEnv } from '@/lib/env'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

// Server component — MUST stay dynamic so every navigation generates a
// fresh checkoutAttemptId. A cached render would reuse the same token
// across users and sessions, collapsing dedupe into a shared-token
// collision. `force-dynamic` is explicit defence against that.
export const dynamic = 'force-dynamic'

export default async function CheckoutPage() {
  // All work outside the session is safe to kick off in parallel. The
  // user + addresses queries, by contrast, gate on `auth()` and only run
  // for authenticated sessions.
  const [shippingConfig, session] = await Promise.all([
    getShippingConfigurationSnapshot(),
    auth(),
  ])
  const { paymentProvider } = getServerEnv()

  let userFirstName = ''
  let userLastName = ''
  let initialAddresses: SavedCheckoutAddress[] | undefined
  if (session?.user?.id) {
    // Batch user + addresses so the checkout critical path loses one
    // round-trip — the CheckoutPageClient previously refetched addresses
    // from the browser in a useEffect, adding 100–300 ms of "Loading…"
    // before the buyer could pick one.
    const [user, addresses] = await Promise.all([
      db.user.findUnique({
        where: { id: session.user.id },
        select: { firstName: true, lastName: true },
      }),
      db.address.findMany({
        where: { userId: session.user.id },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          line1: true,
          line2: true,
          city: true,
          province: true,
          postalCode: true,
          phone: true,
          isDefault: true,
        },
      }),
    ])
    userFirstName = user?.firstName ?? ''
    userLastName = user?.lastName ?? ''
    initialAddresses = addresses
  }

  // #410/#524: server-issued idempotency token for this render. Passed
  // to the client which submits it with createCheckoutOrder. The
  // backend uses it to dedupe double-submits and concurrent races.
  // A fresh token per render means cart edits force a new attempt id.
  const checkoutAttemptId = generateCheckoutAttemptId()
  return (
    <CheckoutPageClient
      shippingZones={shippingConfig.zones}
      shippingRates={shippingConfig.rates}
      fallbackShippingCost={shippingConfig.fallbackCost}
      showDemoNotice={paymentProvider === 'mock'}
      userFirstName={userFirstName}
      userLastName={userLastName}
      checkoutAttemptId={checkoutAttemptId}
      initialAddresses={initialAddresses}
      hasSession={Boolean(session?.user?.id)}
    />
  )
}
