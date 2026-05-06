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

// #1284 — bounds match the source-of-truth column constraints in
// `prisma/schema.prisma` and the input schemas in
// `src/shared/types/products.ts`. Adding bounds at read time means a
// historical row that somehow grew past the original write-time
// validator (column-level expansion, manual SQL edit) still fails
// loudly here instead of silently rendering megabytes of unbounded
// JSON into an admin UI.
const orderLineSnapshotV1Schema = z.object({
  version: z.literal(1).default(1),
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  images: z.array(z.string().max(2048)).max(20),
  unit: z.string().min(1).max(32),
  vendorName: z.string().min(1).max(200),
  variantName: z.string().max(200).nullable().optional(),
})

export const orderLineSnapshotSchema = orderLineSnapshotV1Schema

export type OrderLineSnapshot = z.infer<typeof orderLineSnapshotSchema>

// #1284 — bounds match `domains/auth/buyer-address-schema.ts` (the
// write-side validator) so a snapshot can never carry a value the
// live form would have rejected. line1/line2/phone capped slightly
// above the form to absorb legacy rows.
const orderAddressSnapshotV1Schema = z.object({
  version: z.literal(1).default(1),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).nullable().optional(),
  city: z.string().min(1).max(120),
  province: z.string().min(1).max(120),
  postalCode: z.string().min(1).max(20),
  phone: z.string().max(40).nullable().optional(),
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
