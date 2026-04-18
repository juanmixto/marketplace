import { db } from '@/lib/db'
import { z } from 'zod'
import type { TelegramCallbackQuery } from '../update-schema'
import { answerCallbackQuery } from '../service'

export type ActionContext = {
  userId: string
  chatId: string
  targetId: string
  callbackQueryId: string
  messageId: number | null
}

export type ActionHandler = (ctx: ActionContext) => Promise<void>

// HMR in dev re-evaluates this module on every change; without a
// globalThis-backed registry the Map would reset between the startup
// hook that registers actions and the callback_query handler that
// looks them up, producing "Acción no soportada" on every button tap.
const GLOBAL_KEY = '__marketplaceTelegramActionRegistry'

type GlobalWithRegistry = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, ActionHandler>
}

function getRegistry(): Map<string, ActionHandler> {
  const g = globalThis as GlobalWithRegistry
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map<string, ActionHandler>()
  }
  return g[GLOBAL_KEY]
}

export function registerAction(name: string, handler: ActionHandler): void {
  getRegistry().set(name, handler)
}

const callbackDataSchema = z
  .string()
  .max(64, 'callback_data must be ≤ 64 bytes')
  .regex(/^[a-zA-Z]+:[a-zA-Z0-9_-]+$/)

export async function dispatchCallbackQuery(
  query: TelegramCallbackQuery,
): Promise<void> {
  const chatId = query.message?.chat.id
  if (!chatId) {
    console.warn('telegram.action.missing_chat', { callbackQueryId: query.id })
    return
  }
  const chatIdStr = String(chatId)
  const data = query.data ?? ''

  const parsed = callbackDataSchema.safeParse(data)
  if (!parsed.success) {
    await logAction(null, chatIdStr, 'invalid_data', { data }, false, 'BAD_FORMAT')
    await answerCallbackQuery(query.id, 'Acción no soportada').catch(() => undefined)
    return
  }

  const [name, targetId] = parsed.data.split(':') as [string, string]
  const handler = getRegistry().get(name)
  if (!handler) {
    await logAction(null, chatIdStr, name, { targetId }, false, 'UNKNOWN_ACTION')
    await answerCallbackQuery(query.id, 'Acción no soportada').catch(() => undefined)
    return
  }

  const link = await db.telegramLink.findUnique({
    where: { chatId: chatIdStr },
    select: { userId: true, isActive: true },
  })
  if (!link || !link.isActive) {
    await logAction(null, chatIdStr, name, { targetId }, false, 'NO_ACTIVE_LINK')
    await answerCallbackQuery(query.id, 'Cuenta no vinculada').catch(() => undefined)
    return
  }

  const ctx: ActionContext = {
    userId: link.userId,
    chatId: chatIdStr,
    targetId,
    callbackQueryId: query.id,
    messageId: query.message?.message_id ?? null,
  }

  try {
    await handler(ctx)
    await logAction(link.userId, chatIdStr, name, { targetId }, true, null)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await logAction(link.userId, chatIdStr, name, { targetId }, false, error)
    console.error('telegram.action.failed', { name, error })
    await answerCallbackQuery(query.id, 'No se pudo ejecutar la acción').catch(() => undefined)
  }
}

type ActionLogPayload = { [key: string]: string | number | boolean | null }

async function logAction(
  userId: string | null,
  chatId: string,
  action: string,
  payload: ActionLogPayload,
  success: boolean,
  error: string | null,
): Promise<void> {
  try {
    await db.telegramActionLog.create({
      data: { userId, chatId, action, payload, success, error },
    })
  } catch (err) {
    console.error('telegram.action.log_failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
