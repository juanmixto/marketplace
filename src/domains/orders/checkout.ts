import { z } from 'zod'
import {
  calculateShippingCost,
  MARKETPLACE_SETTINGS_DEFAULTS,
  type PublicMarketplaceSettings,
} from '@/lib/marketplace-settings'

export const addressSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  line1: z.string().min(5),
  line2: z.string().optional(),
  city: z.string().min(1),
  province: z.string().min(1),
  postalCode: z.string().regex(/^\d{5}$/, 'Código postal inválido'),
  phone: z.string().optional(),
})

export const checkoutSchema = z.object({
  address: addressSchema,
  saveAddress: z.boolean().optional(),
})

export type CheckoutFormData = z.infer<typeof checkoutSchema>

export interface OrderPricingLine {
  unitPrice: number
  quantity: number
  taxRate: number
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

export function getIncludedTaxAmount(unitPrice: number, quantity: number, taxRate: number) {
  const gross = unitPrice * quantity
  const net = gross / (1 + taxRate)
  return roundCurrency(gross - net)
}

export function calculateOrderTotals(lines: OrderPricingLine[]) {
  return calculateOrderTotalsWithConfig(lines, MARKETPLACE_SETTINGS_DEFAULTS)
}

export function calculateOrderTotalsWithConfig(
  lines: OrderPricingLine[],
  settings: Pick<PublicMarketplaceSettings, 'FREE_SHIPPING_THRESHOLD' | 'FLAT_SHIPPING_COST'>
) {
  const subtotal = roundCurrency(
    lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  )
  const taxAmount = roundCurrency(
    lines.reduce((sum, line) => sum + getIncludedTaxAmount(line.unitPrice, line.quantity, line.taxRate), 0)
  )
  const shippingCost = calculateShippingCost(subtotal, settings)
  const grandTotal = roundCurrency(subtotal + shippingCost)

  return {
    subtotal,
    taxAmount,
    shippingCost,
    grandTotal,
  }
}
