import { CheckoutPageClient } from '@/components/buyer/CheckoutPageClient'
import { getShippingConfigurationSnapshot } from '@/domains/shipping/calculator'
import { generateCheckoutAttemptId } from '@/domains/orders/checkout-token'
import { getServerEnv } from '@/lib/env'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

// Server component — MUST stay dynamic so every navigation generates a
// fresh checkoutAttemptId. A cached render would reuse the same token
// across users and sessions, collapsing dedupe into a shared-token
// collision. `force-dynamic` is explicit defence against that.
export const dynamic = 'force-dynamic'

export default async function CheckoutPage() {
  const shippingConfig = await getShippingConfigurationSnapshot()
  const { paymentProvider } = getServerEnv()
  const session = await auth()
  let userFirstName = ''
  let userLastName = ''
  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { firstName: true, lastName: true },
    })
    userFirstName = user?.firstName ?? ''
    userLastName = user?.lastName ?? ''
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
    />
  )
}
