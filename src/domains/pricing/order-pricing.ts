// Order-pricing primitives: subtotal, included VAT, totals with a
// caller-supplied shipping cost. Lives in the pricing subdomain because
// every caller (createOrder, checkout client, admin recomputes) needs
// the same canonical math; keeping it here means there's exactly one
// place where the rounding rule and the "tax included in price" rule
// are defined.
//
// Owns nothing about discounts, promotions, or shipping calculation —
// those are inputs supplied by callers (orders/, promotions/,
// shipping/). See cart-totals.ts for the buyer-facing composition.

export interface OrderPricingLine {
  unitPrice: number
  quantity: number
  taxRate: number
}

export function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

export function getIncludedTaxAmount(unitPrice: number, quantity: number, taxRate: number) {
  const gross = unitPrice * quantity
  const net = gross / (1 + taxRate)
  return roundCurrency(gross - net)
}

export function calculateOrderPricing(lines: OrderPricingLine[]) {
  const subtotal = roundCurrency(
    lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  )
  const taxAmount = roundCurrency(
    lines.reduce((sum, line) => sum + getIncludedTaxAmount(line.unitPrice, line.quantity, line.taxRate), 0)
  )

  return {
    subtotal,
    taxAmount,
  }
}

export function calculateOrderTotals(lines: OrderPricingLine[]) {
  return calculateOrderTotalsWithShippingCost(lines, 4.95)
}

export function calculateOrderTotalsWithShippingCost(
  lines: OrderPricingLine[],
  shippingCost: number
) {
  const { subtotal, taxAmount } = calculateOrderPricing(lines)
  const grandTotal = roundCurrency(subtotal + shippingCost)

  return {
    subtotal,
    taxAmount,
    shippingCost: roundCurrency(shippingCost),
    grandTotal,
  }
}
