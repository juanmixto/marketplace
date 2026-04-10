import { CartPageClient } from '@/components/buyer/CartPageClient'
import { getPublicMarketplaceConfig } from '@/lib/config'

export default async function CarritoPage() {
  const shippingSettings = await getPublicMarketplaceConfig()
  return <CartPageClient shippingSettings={shippingSettings} />
}
