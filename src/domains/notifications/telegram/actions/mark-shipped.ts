import { markShippedByUserId } from '@/domains/vendors'
import type { ActionContext } from './registry'
import {
  answerCallbackQuery,
  editMessageRemoveKeyboard,
} from '../service'

export async function markShippedAction(ctx: ActionContext): Promise<void> {
  const result = await markShippedByUserId(ctx.userId, ctx.targetId)

  if (!result.ok) {
    const message =
      result.code === 'NOT_FOUND'
        ? 'Pedido no encontrado o ya no es tuyo'
        : result.message
    await answerCallbackQuery(ctx.callbackQueryId, message)
    return
  }

  await answerCallbackQuery(ctx.callbackQueryId, '📦 Pedido enviado')
  if (ctx.messageId !== null) {
    await editMessageRemoveKeyboard(ctx.chatId, ctx.messageId).catch(() => undefined)
  }
}
