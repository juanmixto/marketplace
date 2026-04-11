import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { getOrderDetail } from '@/domains/orders/actions'
import { canLeaveReview } from '@/domains/reviews/actions'
import { OrderDetailClient } from './OrderDetailClient'
import { TrackEventOnView } from '@/components/analytics/TrackEventOnView'
import type { Metadata } from 'next'

interface Props { params: Promise<{ id: string }>, searchParams: Promise<{ nuevo?: string }> }

export const metadata: Metadata = { title: 'Detalle del pedido' }

export default async function OrderDetailPage({ params, searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params
  const { nuevo } = await searchParams
  const order = await getOrderDetail(id)
  if (!order) notFound()

  // Convert to plain object for serializable client component props
  const reviewEligibility = Object.fromEntries(
    await Promise.all(
      order.lines.map(async line => [line.productId, await canLeaveReview(order.id, line.productId)] as const)
    )
  )

  return (
    <>
      {nuevo === '1' && (
        <TrackEventOnView
          event="purchase"
          payload={{
            transaction_id: order.id,
            currency: 'EUR',
            value: Number(order.grandTotal),
            tax: Number(order.taxAmount),
            shipping: Number(order.shippingCost),
            items: order.lines.map(line => ({
              item_id: line.productId,
              item_name: line.product.name,
              price: Number(line.unitPrice),
              quantity: line.quantity,
            })),
          }}
        />
      )}
      <OrderDetailClient
        order={order as Parameters<typeof OrderDetailClient>[0]['order']}
        nuevo={nuevo === '1'}
        reviewEligibility={reviewEligibility}
      />
    </>
  )
}
