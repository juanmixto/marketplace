import { z } from 'zod'
import { IncidentType } from '@/generated/prisma/enums'

/**
 * Shared incident contracts. Both bodies were previously declared
 * inline in their respective routes:
 *
 *   - openIncidentBodySchema       → src/app/api/incidents/route.ts
 *   - incidentMessageBodySchema    → src/app/api/incidents/[id]/messages/route.ts
 *
 * The numeric limits are exported so any future client-side counter
 * (e.g. "N/5000 characters") stays in sync with the server cap.
 */
export const INCIDENT_DESCRIPTION_LIMITS = {
  min: 10,
  max: 5000,
} as const

export const INCIDENT_MESSAGE_LIMITS = {
  min: 1,
  max: 5000,
} as const

// Caps the number of photos a buyer can submit on a single incident /
// reply. Five is generous for documenting damage without giving an
// attacker an easy way to fill blob storage.
export const INCIDENT_ATTACHMENTS_MAX = 5

// URLs the upload endpoint produces in either backend (see
// blob-storage.ts). Local backend → `/uploads/...`. Vercel Blob → an
// https URL on `*.public.blob.vercel-storage.com`. Anything else is
// rejected so a malicious client can't smuggle an arbitrary URL into
// the attachments array.
const attachmentUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    value => {
      if (value.startsWith('/uploads/')) return true
      try {
        const url = new URL(value)
        return (
          url.protocol === 'https:' &&
          url.hostname.endsWith('public.blob.vercel-storage.com')
        )
      } catch {
        return false
      }
    },
    { message: 'attachment-url-not-allowed' }
  )

export const incidentAttachmentsSchema = z
  .array(attachmentUrlSchema)
  .max(INCIDENT_ATTACHMENTS_MAX)
  .default([])

export const openIncidentBodySchema = z.object({
  orderId: z.string().min(1),
  type: z.nativeEnum(IncidentType),
  description: z
    .string()
    .min(INCIDENT_DESCRIPTION_LIMITS.min)
    .max(INCIDENT_DESCRIPTION_LIMITS.max),
  attachments: incidentAttachmentsSchema.optional(),
})

export type OpenIncidentInput = z.infer<typeof openIncidentBodySchema>

export const incidentMessageBodySchema = z.object({
  body: z
    .string()
    .min(INCIDENT_MESSAGE_LIMITS.min)
    .max(INCIDENT_MESSAGE_LIMITS.max),
  attachments: incidentAttachmentsSchema.optional(),
})

export type IncidentMessageInput = z.infer<typeof incidentMessageBodySchema>
