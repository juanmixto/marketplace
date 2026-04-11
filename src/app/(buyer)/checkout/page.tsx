import { CheckoutPageClient } from '@/components/buyer/CheckoutPageClient'
import { getShippingConfigurationSnapshot } from '@/domains/shipping/calculator'
import { getServerEnv } from '@/lib/env'

export default async function CheckoutPage() {
  const shippingConfig = await getShippingConfigurationSnapshot()
  const { paymentProvider } = getServerEnv()
  return (
    <CheckoutPageClient
      shippingZones={shippingConfig.zones}
      shippingRates={shippingConfig.rates}
      fallbackShippingCost={shippingConfig.fallbackCost}
      showDemoNotice={paymentProvider === 'mock'}
    />
  )
}
