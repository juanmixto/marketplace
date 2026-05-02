'use client'

import { useEffect } from 'react'
import { createAnalyticsItem, trackAnalyticsEvent } from '@/lib/analytics'
import { getBuyerFunnelContext } from '@/lib/analytics-buyer-context'

export interface PurchaseTrackerItem {
  productId: string
  name: string
  price: number
  quantity: number
  variantName?: string | null
  vendorName?: string | null
  categoryName?: string | null
}

interface PurchaseTrackerProps {
  orderId: string
  orderNumber: string
  currency: string
  revenue: number
  tax: number
  shipping: number
  items: PurchaseTrackerItem[]
}

/**
 * Emits the `purchase` analytics event exactly once per order (#569),
 * guarded by sessionStorage on `orderNumber`. Mounted on the order
 * confirmation page: both mock and Stripe flows land here, and the
 * replay path from the double-submit dedupe (#524) lands here too —
 * the guard stops the replay from double-counting revenue.
 *
 * Runs on the client only; the confirmation server component owns
 * the order lookup and decides what to forward here. No PII is
 * shipped to analytics (no buyer PII — the tracker takes only numeric
 * totals and item ids).
 */
export function PurchaseTracker({
  orderId,
  orderNumber,
  currency,
  revenue,
  tax,
  shipping,
  items,
}: PurchaseTrackerProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const storageKey = `analytics:purchase:${orderNumber}`
    try {
      if (window.sessionStorage.getItem(storageKey)) return
      window.sessionStorage.setItem(storageKey, '1')
    } catch {
      // Private mode / quota: fall through and emit. Double-emission
      // is less bad than missing the conversion event entirely.
    }

    trackAnalyticsEvent('purchase', {
      transaction_id: orderId,
      order_number: orderNumber,
      currency,
      value: revenue,
      tax,
      shipping,
      items: items.map(item =>
        createAnalyticsItem({
          id: item.productId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          variant: item.variantName,
          brand: item.vendorName,
          category: item.categoryName,
        }),
      ),
    })

    // CF-1 funnel: `order.placed`. Reuses the same once-per-order
    // sessionStorage guard above (the early-return at the top of this
    // effect) so replay-path renders don't double-fire. Multi-vendor
    // carts surface as multiple `vendor_id` values in the items
    // array; the funnel insight cares about the order-level event,
    // not per-vendor.
    const { device, referrer } = getBuyerFunnelContext()
    trackAnalyticsEvent('order.placed', {
      order_id: orderId,
      order_number: orderNumber,
      value: revenue,
      currency,
      item_count: items.reduce((sum, item) => sum + item.quantity, 0),
      device,
      referrer,
    })
  }, [orderId, orderNumber, currency, revenue, tax, shipping, items])

  return null
}
