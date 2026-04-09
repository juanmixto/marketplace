import { CheckoutPageClient } from '@/components/buyer/CheckoutPageClient'
import { getPublicMarketplaceConfig } from '@/lib/config'

export default async function CheckoutPage() {
  const shippingSettings = await getPublicMarketplaceConfig()
  return <CheckoutPageClient shippingSettings={shippingSettings} />
}
