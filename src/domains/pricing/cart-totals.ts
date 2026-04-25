// Buyer-facing cart-totals composition. Pure: takes a base subtotal,
// a base shipping cost (already resolved by shipping/), and a set of
// optional discounts (already evaluated by promotions/), and returns
// the rounded breakdown the buyer sees on the checkout page.
//
// Lives here (not in orders/ or in the React client) so the math is
// unit-tested and stays in lock-step with createOrder's server-side
// totals. Inputs are clamped so a promotion can never produce a
// negative shipping or grand total.

import { roundCurrency } from './order-pricing'

export interface CartDiscountInput {
  subtotalDiscount?: number
  shippingDiscount?: number
}

export interface CartTotalsBreakdown {
  subtotal: number
  subtotalDiscount: number
  shippingDiscount: number
  shipping: number
  total: number
}

export function applyCartDiscounts(
  baseSubtotal: number,
  baseShipping: number,
  { subtotalDiscount = 0, shippingDiscount = 0 }: CartDiscountInput = {},
): CartTotalsBreakdown {
  const safeSubtotalDiscount = Math.max(0, subtotalDiscount)
  const safeShippingDiscount = Math.max(0, shippingDiscount)
  const shipping = roundCurrency(Math.max(0, baseShipping - safeShippingDiscount))
  const total = roundCurrency(Math.max(0, baseSubtotal - safeSubtotalDiscount + shipping))

  return {
    subtotal: roundCurrency(baseSubtotal),
    subtotalDiscount: roundCurrency(safeSubtotalDiscount),
    shippingDiscount: roundCurrency(safeShippingDiscount),
    shipping,
    total,
  }
}
