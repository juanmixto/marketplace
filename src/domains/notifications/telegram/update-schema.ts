import { z } from 'zod'

const telegramUserSchema = z.object({
  id: z.number(),
  is_bot: z.boolean().optional(),
  username: z.string().optional(),
  first_name: z.string().optional(),
})

const telegramChatSchema = z.object({
  id: z.number(),
  type: z.string(),
})

export const telegramMessageSchema = z.object({
  message_id: z.number(),
  from: telegramUserSchema.optional(),
  chat: telegramChatSchema,
  date: z.number(),
  text: z.string().optional(),
})
export type TelegramMessage = z.infer<typeof telegramMessageSchema>

export const telegramCallbackQuerySchema = z.object({
  id: z.string(),
  from: telegramUserSchema,
  message: z
    .object({
      message_id: z.number(),
      chat: telegramChatSchema,
    })
    .optional(),
  data: z.string().optional(),
})
export type TelegramCallbackQuery = z.infer<typeof telegramCallbackQuerySchema>

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: telegramMessageSchema.optional(),
  callback_query: telegramCallbackQuerySchema.optional(),
})
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>
