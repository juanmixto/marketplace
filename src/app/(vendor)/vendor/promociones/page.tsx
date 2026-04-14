import type { Metadata } from 'next'
import { listMyPromotions } from '@/domains/promotions/actions'
import { VendorPromotionsListClient } from '@/components/vendor/VendorPromotionsListClient'

export const metadata: Metadata = { title: 'Promociones' }

export default async function VendorPromotionsPage() {
  const promotions = await listMyPromotions('all')
  return <VendorPromotionsListClient promotions={promotions} />
}
