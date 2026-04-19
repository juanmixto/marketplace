import { prepareFulfillmentByUserId } from '@/domains/shipping/actions'
import type { ActionContext } from './registry'
import {
  answerCallbackQuery,
  editMessageRemoveKeyboard,
} from '../service'

export async function prepareFulfillmentAction(ctx: ActionContext): Promise<void> {
  const result = await prepareFulfillmentByUserId(ctx.userId, ctx.targetId)

  if (!result.ok) {
    const message =
      result.code === 'NOT_FOUND'
        ? 'Pedido no encontrado o ya no es tuyo'
        : result.code === 'VENDOR_ADDRESS_MISSING'
          ? 'Configura tu dirección de origen en el portal antes de generar etiquetas'
          : result.message
    await answerCallbackQuery(ctx.callbackQueryId, message)
    return
  }

  await answerCallbackQuery(ctx.callbackQueryId, '🏷️ Etiqueta generada')
  if (ctx.messageId !== null) {
    await editMessageRemoveKeyboard(ctx.chatId, ctx.messageId).catch(() => undefined)
  }
}
