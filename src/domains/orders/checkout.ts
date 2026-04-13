import { z } from 'zod'
import {
  SPAIN_PROVINCE_BY_PREFIX,
  getPrefixForProvince,
  isValidPhone,
  postalCodeMatchesProvince,
} from '@/domains/shipping/spain-provinces'

const VALID_PROVINCE_NAMES = new Set(Object.values(SPAIN_PROVINCE_BY_PREFIX))

export const addressSchema = z
  .object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    line1: z.string().trim().min(5),
    line2: z.string().optional(),
    city: z.string().trim().min(1),
    province: z
      .string()
      .trim()
      .refine(v => VALID_PROVINCE_NAMES.has(v), 'Provincia inválida'),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/, 'Código postal inválido'),
    phone: z
      .string()
      .trim()
      .optional()
      .refine(v => !v || isValidPhone(v), 'Teléfono inválido'),
  })
  .superRefine((value, ctx) => {
    if (!postalCodeMatchesProvince(value.postalCode, value.province)) {
      const prefix = getPrefixForProvince(value.province)
      ctx.addIssue({
        code: 'custom',
        path: ['postalCode'],
        message: prefix
          ? `El código postal de ${value.province} debe empezar por ${prefix}`
          : 'El código postal no coincide con la provincia',
      })
    }
  })

export const checkoutSchema = z.object({
  address: addressSchema,
  saveAddress: z.boolean().optional(),
  selectedAddressId: z.string().min(1).optional(),
})

export type CheckoutFormData = z.infer<typeof checkoutSchema>

export interface SavedCheckoutAddress {
  id: string
  firstName: string
  lastName: string
  line1: string
  line2?: string | null
  city: string
  province: string
  postalCode: string
  phone?: string | null
  isDefault: boolean
}

export function getPreferredCheckoutAddress<T extends SavedCheckoutAddress>(addresses: T[]) {
  return addresses.find(address => address.isDefault) ?? addresses[0] ?? null
}

export function toCheckoutFormAddress(address: SavedCheckoutAddress) {
  return {
    firstName: address.firstName,
    lastName: address.lastName,
    line1: address.line1,
    line2: address.line2 ?? '',
    city: address.city,
    province: address.province,
    postalCode: address.postalCode,
    phone: address.phone ?? '',
    saveAddress: false,
  }
}

export const orderItemSchema = z.object({
  productId: z.string().min(1, 'Producto inválido'),
  variantId: z.string().min(1).optional(),
  quantity: z.number().int().positive('La cantidad debe ser un entero positivo'),
})

export const orderItemsSchema = z.array(orderItemSchema)
  .min(1, 'El carrito no puede estar vacío')
  .superRefine((items, ctx) => {
    const seen = new Set<string>()

    for (const [index, item] of items.entries()) {
      const key = `${item.productId}:${item.variantId ?? ''}`
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'No se permiten productos duplicados en el pedido',
          path: [index],
        })
        continue
      }

      seen.add(key)
    }
  })

export type OrderItemInput = z.infer<typeof orderItemSchema>

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
