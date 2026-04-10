import { CheckoutPageClient } from '@/components/buyer/CheckoutPageClient'
import { getShippingConfigurationSnapshot } from '@/domains/shipping/calculator'

export default async function CheckoutPage() {
  const shippingConfig = await getShippingConfigurationSnapshot()
  return (
    <CheckoutPageClient
      shippingZones={shippingConfig.zones}
      shippingRates={shippingConfig.rates}
      fallbackShippingCost={shippingConfig.fallbackCost}
    />
  )
}
