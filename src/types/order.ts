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
