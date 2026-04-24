import type { ActionContext } from './registry'
import {
  answerCallbackQuery,
  editMessageRemoveKeyboard,
  sendRawMessage,
} from '../service'

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
}

// Deferred import — shipping imports notifications for transition events,
// and this callback only fires on user interaction, so the lazy import
// keeps the static domain graph acyclic without a runtime penalty.
export async function prepareFulfillmentAction(ctx: ActionContext): Promise<void> {
  const { prepareFulfillmentByUserId } = await import('@/domains/shipping/actions')
  const result = await prepareFulfillmentByUserId(ctx.userId, ctx.targetId)

  if (!result.ok) {
    const message =
      result.code === 'NOT_FOUND'
        ? 'Pedido no encontrado o ya no es tuyo'
        : result.code === 'VENDOR_ADDRESS_MISSING'
          ? 'Configura tu dirección de origen en el portal antes de generar etiquetas'
          : result.message
    await answerCallbackQuery(ctx.callbackQueryId, message)
    if (result.code === 'VENDOR_ADDRESS_MISSING') {
      await sendRawMessage(ctx.chatId, {
        text: '📦 Configura tu dirección de origen antes de generar etiquetas.',
        inline_keyboard: [
          [{ text: '🏠 Configurar dirección', url: `${appUrl()}/vendor/perfil#shipping-address` }],
        ],
      }).catch(() => undefined)
    }
    return
  }

  await answerCallbackQuery(ctx.callbackQueryId, '🏷️ Etiqueta generada')
  if (ctx.messageId !== null) {
    await editMessageRemoveKeyboard(ctx.chatId, ctx.messageId).catch(() => undefined)
  }
}
