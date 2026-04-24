import { z } from 'zod'

export const vendorApplicationSchema = z.object({
  displayName: z.string().trim().min(2, 'Nombre demasiado corto').max(80),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  location: z.string().trim().max(120).optional().or(z.literal('')),
  category: z
    .enum(['BAKERY', 'CHEESE', 'WINERY', 'ORCHARD', 'OLIVE_OIL', 'FARM', 'DRYLAND', 'LOCAL_PRODUCER'])
    .optional(),
})

export type VendorApplicationInput = z.infer<typeof vendorApplicationSchema>

export type VendorApplicationResult =
  | { ok: true; vendorId: string }
  | { ok: false; error: 'unauthenticated' | 'already_applied' | 'validation'; issues?: string[] }
