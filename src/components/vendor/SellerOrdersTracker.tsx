'use client'

import { useEffect } from 'react'
import { trackAnalyticsEvent } from '@/lib/analytics'

interface TrackedOrder {
  fulfillmentId: string
  orderId: string
  orderValue: number
  itemCount: number
}

interface Props {
  orders: TrackedOrder[]
}

const STORAGE_KEY = 'seller_order_received:seen'

function readSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function writeSeen(seen: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    // Keep the set bounded so localStorage can't grow indefinitely.
    const trimmed = [...seen].slice(-500)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Silent
  }
}

/**
 * Fires `seller_order_received` once per fulfillment id the vendor sees on
 * their orders page. Dedup lives in localStorage so reloads are safe.
 */
export function SellerOrdersTracker({ orders }: Props) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (orders.length === 0) return

    const seen = readSeen()
    let mutated = false

    for (const order of orders) {
      if (seen.has(order.fulfillmentId)) continue
      trackAnalyticsEvent('seller_order_received', {
        fulfillment_id: order.fulfillmentId,
        order_id: order.orderId,
        order_value: order.orderValue,
        item_count: order.itemCount,
        currency: 'EUR',
      })
      seen.add(order.fulfillmentId)
      mutated = true
    }

    if (mutated) writeSeen(seen)
  }, [orders])

  return null
}
