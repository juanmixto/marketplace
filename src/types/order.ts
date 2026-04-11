import { z } from 'zod'

export const orderLineSnapshotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  images: z.array(z.string()),
  unit: z.string().min(1),
  vendorName: z.string().min(1),
  variantName: z.string().nullable().optional(),
})

export type OrderLineSnapshot = z.infer<typeof orderLineSnapshotSchema>

export const orderAddressSnapshotSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().nullable().optional(),
  city: z.string().min(1),
  province: z.string().min(1),
  postalCode: z.string().min(1),
  phone: z.string().nullable().optional(),
})

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
