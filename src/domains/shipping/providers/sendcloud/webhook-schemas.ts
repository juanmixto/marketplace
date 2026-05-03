import { z } from 'zod'

/**
 * Boundary schema for Sendcloud parcel-status webhooks.
 *
 * Mirrors the (previously TS-only) `SendcloudWebhookPayload` interface
 * from `src/domains/shipping/webhooks/sendcloud.ts`. Runtime validation
 * here lets the route reject malformed payloads with 400 instead of
 * letting an `as`-cast leak into the dead-letter pipeline (#568).
 *
 * Required vs optional matches what `handleSendcloudWebhook` actually
 * reads: `parcel.id` and `parcel.status.{id,message}` are load-bearing,
 * `tracking_number` is best-effort metadata, and the top-level
 * `action` / `timestamp` fields are derived/optional in real Sendcloud
 * payloads.
 */
export const sendcloudWebhookPayloadSchema = z.object({
  action: z.string().optional(),
  timestamp: z.number().optional(),
  parcel: z
    .object({
      id: z.number(),
      tracking_number: z.string().nullable().optional(),
      status: z.object({
        id: z.number(),
        message: z.string(),
      }),
    })
    .optional(),
})

export type SendcloudWebhookPayloadParsed = z.infer<typeof sendcloudWebhookPayloadSchema>
