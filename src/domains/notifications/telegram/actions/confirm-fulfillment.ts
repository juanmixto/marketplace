import type { ActionContext } from './registry'
import {
  answerCallbackQuery,
  editMessageRemoveKeyboard,
} from '../service'

// Deferred import — vendors depends on notifications for event emission,
// and Telegram callback actions only run when the user taps a button, so
// loading the vendor module lazily keeps the static domain graph acyclic
// without changing runtime behaviour.
export async function confirmFulfillmentAction(ctx: ActionContext): Promise<void> {
  const { confirmFulfillmentByUserId } = await import('@/domains/vendors')
  const result = await confirmFulfillmentByUserId(ctx.userId, ctx.targetId)

  if (!result.ok) {
    const message =
      result.code === 'NOT_FOUND'
        ? 'Pedido no encontrado o ya no es tuyo'
        : result.message
    await answerCallbackQuery(ctx.callbackQueryId, message)
    return
  }

  await answerCallbackQuery(ctx.callbackQueryId, '✅ Pedido confirmado')
  if (ctx.messageId !== null) {
    await editMessageRemoveKeyboard(ctx.chatId, ctx.messageId).catch(() => undefined)
  }
}
