import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { getOrderDetail } from '@/domains/orders/actions'
import { canLeaveReview } from '@/domains/reviews/actions'
import { OrderDetailClient } from './OrderDetailClient'
import { TrackEventOnView } from '@/components/analytics/TrackEventOnView'
import type { Metadata } from 'next'
import { parseOrderAddressSnapshot } from '@/types/order'

interface Props { params: Promise<{ id: string }>, searchParams: Promise<{ nuevo?: string }> }

export const metadata: Metadata = { title: 'Detalle del pedido' }

export default async function OrderDetailPage({ params, searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params
  const { nuevo } = await searchParams
  const order = await getOrderDetail(id)
  if (!order) notFound()
  const orderAddress = parseOrderAddressSnapshot(order.shippingAddressSnapshot) ?? (
    order.address
      ? {
          firstName: order.address.firstName,
          lastName: order.address.lastName,
          line1: order.address.line1,
          line2: order.address.line2,
          postalCode: order.address.postalCode,
          city: order.address.city,
          province: order.address.province,
          phone: order.address.phone,
        }
      : null
  )

  // Convert to plain object for serializable client component props
  const reviewEligibility = Object.fromEntries(
    await Promise.all(
      order.lines.map(async line => [line.productId, await canLeaveReview(order.id, line.productId)] as const)
    )
  )

  const serializedOrder = {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    placedAt: order.placedAt.toISOString(),
    subtotal: Number(order.subtotal),
    shippingCost: Number(order.shippingCost),
    grandTotal: Number(order.grandTotal),
    lines: order.lines.map(line => ({
      id: line.id,
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: Number(line.unitPrice),
      productSnapshot: line.productSnapshot,
      product: {
        name: line.product.name,
        images: line.product.images,
        slug: line.product.slug,
        unit: line.product.unit,
      },
    })),
    fulfillments: order.fulfillments.map(fulfillment => ({
      id: fulfillment.id,
      status: fulfillment.status,
      trackingNumber: fulfillment.trackingNumber,
      vendor: {
        displayName: fulfillment.vendor.displayName,
      },
    })),
    address: orderAddress
      ? {
          firstName: orderAddress.firstName,
          lastName: orderAddress.lastName,
          line1: orderAddress.line1,
          line2: orderAddress.line2 ?? null,
          postalCode: orderAddress.postalCode,
          city: orderAddress.city,
          province: orderAddress.province,
        }
      : null,
  }

  return (
    <>
      {nuevo === '1' && (
        <TrackEventOnView
          event="purchase"
          payload={{
            transaction_id: serializedOrder.id,
            currency: 'EUR',
            value: serializedOrder.grandTotal,
            tax: Number(order.taxAmount),
            shipping: serializedOrder.shippingCost,
            items: serializedOrder.lines.map(line => ({
              item_id: line.productId,
              item_name: line.product.name,
              price: line.unitPrice,
              quantity: line.quantity,
            })),
          }}
        />
      )}
      <OrderDetailClient
        order={serializedOrder}
        nuevo={nuevo === '1'}
        reviewEligibility={reviewEligibility}
      />
    </>
  )
}
