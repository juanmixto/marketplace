import { CheckoutPageClient } from '@/components/buyer/CheckoutPageClient'
import { getShippingConfigurationSnapshot } from '@/domains/shipping/calculator'
import { getServerEnv } from '@/lib/env'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

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
  return (
    <CheckoutPageClient
      shippingZones={shippingConfig.zones}
      shippingRates={shippingConfig.rates}
      fallbackShippingCost={shippingConfig.fallbackCost}
      showDemoNotice={paymentProvider === 'mock'}
      userFirstName={userFirstName}
      userLastName={userLastName}
    />
  )
}
