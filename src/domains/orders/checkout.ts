import { z } from 'zod'
import {
  SPAIN_PROVINCE_BY_PREFIX,
  getPrefixForProvince,
  isPlausiblePhone,
  postalCodeMatchesProvince,
} from '@/domains/shipping'

const VALID_PROVINCE_NAMES = new Set(Object.values(SPAIN_PROVINCE_BY_PREFIX))

// Postal-code-matches-province cross-field check, used by both the
// server `addressSchema` and the client `checkoutFormSchema`. The
// signature matches `z.SuperRefineFunction` so each consumer just
// passes it to `.superRefine(...)` without re-deriving the rule.
function postalProvinceRefiner(
  value: { postalCode: string; province: string },
  ctx: z.RefinementCtx
) {
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
}

export const addressSchema = z
  .object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    line1: z.string().trim().min(1),
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
      .refine(v => !v || isPlausiblePhone(v), 'Teléfono inválido'),
  })
  .superRefine(postalProvinceRefiner)

/**
 * Form schema used by the buyer-facing checkout client. Mirrors
 * `addressSchema` but with localized error messages and the two
 * additional form-level fields (`saveAddress`, `selectedAddressId`)
 * that React-Hook-Form needs at the top level. The server payload
 * structure (with `address` nested) is built from this flat data
 * before the action call.
 *
 * Phase 9 of the contract-hardening plan moved this here so that
 * `CheckoutPageClient.tsx` no longer redeclares the same Zod object
 * inline. The server `addressSchema` and this client schema now
 * share the same postal-code/province refinement and stay in
 * lock-step when fields are added.
 */
export const checkoutFormSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Requerido'),
    lastName: z.string().trim().min(1, 'Requerido'),
    line1: z.string().trim().min(1, 'Escribe la dirección'),
    line2: z.string().optional(),
    city: z.string().trim().min(1, 'Requerido'),
    province: z
      .string()
      .refine(v => VALID_PROVINCE_NAMES.has(v), 'Selecciona una provincia válida'),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/, 'Código postal inválido (5 dígitos)'),
    phone: z
      .string()
      .trim()
      .optional()
      .refine(
        v => !v || isPlausiblePhone(v),
        'Escribe un teléfono de contacto válido',
      ),
    saveAddress: z.boolean().optional(),
    selectedAddressId: z.string().optional(),
    // Guest checkout (#1072): email collected from non-authenticated
    // buyers so the order can be created and the confirmation email
    // can reach them. The server rejects this if a real account
    // already exists for the email (passwordHash / linked account /
    // verified) — it asks the buyer to log in instead.
    guestEmail: z
      .string()
      .trim()
      .email('Introduce un email válido')
      .optional(),
  })
  .superRefine(postalProvinceRefiner)

export type CheckoutFormInput = z.infer<typeof checkoutFormSchema>

export const checkoutSchema = z.object({
  address: addressSchema,
  saveAddress: z.boolean().optional(),
  selectedAddressId: z.string().min(1).optional(),
  guestEmail: z.string().trim().email().optional(),
})

/**
 * Lenient sibling of `checkoutSchema` used when the buyer picks a saved
 * address. The server resolves the real address from the DB row and
 * ignores the submitted `address` payload, so we must NOT hard-fail when
 * a stale field on the form (e.g. an older phone format) would otherwise
 * throw — that was the root cause of the "checkout submit button does
 * nothing" bug: the hidden form failed client-side validation silently
 * and the user had no way to recover.
 */
export const checkoutWithSavedAddressSchema = z.object({
  address: z
    .object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      line1: z.string().optional(),
      line2: z.string().optional(),
      city: z.string().optional(),
      province: z.string().optional(),
      postalCode: z.string().optional(),
      phone: z.string().optional(),
    })
    .passthrough()
    .optional(),
  saveAddress: z.boolean().optional(),
  selectedAddressId: z.string().min(1),
  guestEmail: z.string().trim().email().optional(),
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

// Hard caps to defend against inventory-griefing (#1270). A single line
// quantity above MAX_ITEM_QUANTITY would otherwise be bounded only by
// product stock, which a hostile user can use to reserve popular items
// in the precheck/transaction race window. The cart-level cap stops a
// user from spawning thousands of micro-orders to spam vendors / our
// fulfillment pipeline.
export const MAX_ITEM_QUANTITY = 50
export const MAX_CART_LINES = 20

export const orderItemSchema = z.object({
  productId: z.string().min(1, 'Producto inválido'),
  variantId: z.string().min(1).optional(),
  quantity: z
    .number()
    .int()
    .positive('La cantidad debe ser un entero positivo')
    .max(MAX_ITEM_QUANTITY, `La cantidad máxima por línea es ${MAX_ITEM_QUANTITY}`),
})

export const orderItemsSchema = z.array(orderItemSchema)
  .min(1, 'El carrito no puede estar vacío')
  .max(MAX_CART_LINES, `El carrito no puede tener más de ${MAX_CART_LINES} productos distintos`)
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
