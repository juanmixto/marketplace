import type { ActionContext } from './registry'
import {
  answerCallbackQuery,
  editMessageRemoveKeyboard,
} from '../service'

/**
 * Bumps the product stock by a fixed amount when the vendor taps the
 * "+N stock" button on a stock-low alert. Rejects products with active
 * variants so the vendor heads to the portal for variant-level edits.
 */
const STOCK_INCREMENT = 10

export async function addStockAction(ctx: ActionContext): Promise<void> {
  const { increaseProductStockByUserId } = await import('@/domains/vendors')
  const result = await increaseProductStockByUserId(
    ctx.userId,
    ctx.targetId,
    STOCK_INCREMENT,
  )

  if (!result.ok) {
    const message =
      result.code === 'NOT_FOUND'
        ? 'Producto no encontrado o no es tuyo'
        : result.code === 'HAS_VARIANTS'
          ? 'Tiene variantes — edítalo en la web'
          : result.message
    await answerCallbackQuery(ctx.callbackQueryId, message)
    return
  }

  await answerCallbackQuery(
    ctx.callbackQueryId,
    `✅ +${STOCK_INCREMENT} (ahora: ${result.stock})`,
  )
  if (ctx.messageId !== null) {
    await editMessageRemoveKeyboard(ctx.chatId, ctx.messageId).catch(() => undefined)
  }
}
