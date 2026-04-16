import { z } from 'zod'

/**
 * Versioned JSON-snapshot schemas. Phase 5 of the contract-hardening plan.
 *
 * Snapshots are written into Prisma `Json` columns at order creation time
 * (`OrderLine.productSnapshot`, `Order.shippingAddressSnapshot`) so that
 * later edits to the source Product / Address rows do not retroactively
 * change historical orders. The risk this file mitigates: silently adding
 * a new field to a snapshot schema and reading old (now-incomplete) rows
 * without realizing it.
 *
 * Every snapshot carries a `version: 1` discriminant. When we need a v2
 * shape, we add a `v2Schema` with `version: z.literal(2)` and wrap the
 * union with `z.discriminatedUnion('version', [v1Schema, v2Schema])`.
 * The default on `version` keeps legacy rows (written before the
 * discriminant existed) parseable as v1.
 */

const orderLineSnapshotV1Schema = z.object({
  version: z.literal(1).default(1),
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  images: z.array(z.string()),
  unit: z.string().min(1),
  vendorName: z.string().min(1),
  variantName: z.string().nullable().optional(),
})

export const orderLineSnapshotSchema = orderLineSnapshotV1Schema

export type OrderLineSnapshot = z.infer<typeof orderLineSnapshotSchema>

const orderAddressSnapshotV1Schema = z.object({
  version: z.literal(1).default(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().nullable().optional(),
  city: z.string().min(1),
  province: z.string().min(1),
  postalCode: z.string().min(1),
  phone: z.string().nullable().optional(),
})

export const orderAddressSnapshotSchema = orderAddressSnapshotV1Schema

export type OrderAddressSnapshot = z.infer<typeof orderAddressSnapshotSchema>

export function parseOrderAddressSnapshot(payload: unknown): OrderAddressSnapshot | null {
  const parsed = orderAddressSnapshotSchema.safeParse(payload)
  return parsed.success ? parsed.data : null
}

export const paymentConfirmedEventPayloadSchema = z.object({
  providerRef: z.string().min(1),
  amount: z.number().int().nonnegative().optional(),
  eventId: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
})

export type PaymentConfirmedEventPayload = z.infer<typeof paymentConfirmedEventPayloadSchema>

export const paymentFailedEventPayloadSchema = z.object({
  providerRef: z.string().min(1),
  eventId: z.string().min(1).optional(),
})

export type PaymentFailedEventPayload = z.infer<typeof paymentFailedEventPayloadSchema>

export const paymentMismatchEventPayloadSchema = z.object({
  providerRef: z.string().min(1),
  amount: z.number().int().nonnegative().optional(),
  currency: z.string().min(1).optional(),
  eventId: z.string().min(1).optional(),
  expectedAmount: z.number().nonnegative(),
  expectedCurrency: z.string().min(1),
})

export type PaymentMismatchEventPayload = z.infer<typeof paymentMismatchEventPayloadSchema>
