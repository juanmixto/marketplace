import { z } from 'zod'
import { notificationChannelSchema, notificationEventTypeSchema } from './types'

export const setPreferenceInputSchema = z.object({
  channel: notificationChannelSchema,
  eventType: notificationEventTypeSchema,
  enabled: z.boolean(),
})
export type SetPreferenceInput = z.infer<typeof setPreferenceInputSchema>

export type PreferenceRow = {
  channel: z.infer<typeof notificationChannelSchema>
  eventType: z.infer<typeof notificationEventTypeSchema>
  enabled: boolean
}
