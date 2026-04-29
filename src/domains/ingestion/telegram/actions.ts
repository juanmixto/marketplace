'use server'

import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { enqueue } from '@/lib/queue'
import { createAuditLog, getAuditRequestIp } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { safeRevalidatePath } from '@/lib/revalidate'
import { requireIngestionAdmin } from '@/domains/ingestion/authz'
import { getTelethonSidecarConfig } from './sidecar-config'
import { TelegramActionError } from './action-errors'
import { INGESTION_JOB_KINDS } from '@/domains/ingestion/types'
import { PROCESSING_JOB_KINDS } from '@/domains/ingestion/processing/types'

/**
 * Phase 1 PR-C — admin-facing server actions to onboard a Telegram
 * connection, list available chats, enable chats for sync, and
 * trigger a manual sync.
 *
 * Every action:
 *   1. Goes through `requireIngestionAdmin` (admin role + flag gate).
 *   2. Validates input with Zod.
 *   3. Writes an `AuditLog` row so onboarding has a full trail.
 *   4. Talks to the Python sidecar via a shared-secret HTTP call,
 *      or enqueues a pg-boss job for sync.
 *
 * The sidecar is addressed directly from these actions (not via the
 * worker's `getTelegramProvider`) because auth and chat listing are
 * synchronous operator flows — there's no background job shape for
 * "waiting for an SMS code".
 */

// ─── Zod schemas ────────────────────────────────────────────────────

const phoneRegex = /^\+?[0-9]{7,16}$/

const startAuthSchema = z.object({
  label: z.string().trim().min(1).max(80),
  phoneNumber: z.string().trim().regex(phoneRegex, 'Phone must be E.164-ish digits'),
})

const verifyAuthSchema = z.object({
  connectionId: z.string().min(1),
  code: z.string().trim().min(1).max(12),
  password: z.string().min(1).max(256).optional(),
})

const listChatsSchema = z.object({
  connectionId: z.string().min(1),
})

const enableChatSchema = z.object({
  connectionId: z.string().min(1),
  tgChatId: z.string().regex(/^-?[0-9]+$/),
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['GROUP', 'SUPERGROUP', 'CHANNEL']),
})

const triggerSyncSchema = z.object({
  chatId: z.string().min(1),
})

// ─── Helpers ────────────────────────────────────────────────────────

function phoneNumberHash(phone: string): string {
  // Stored on the Connection row so operators can see WHICH account
  // sits behind a connection without surfacing the raw number in
  // logs or audit payloads.
  return createHash('sha256').update(phone.trim()).digest('hex').slice(0, 32)
}

async function callSidecar(
  path: string,
  body: Record<string, unknown>,
  method: 'POST' | 'GET' = 'POST',
): Promise<{ ok: true; body: unknown } | { ok: false; status: number; body: unknown }> {
  const cfg = getTelethonSidecarConfig()
  const url = `${cfg.baseUrl.replace(/\/$/, '')}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Sidecar-Token': cfg.sharedSecret,
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
  let parsed: unknown = null
  try {
    parsed = await res.json()
  } catch {
    // non-JSON response — fall through with empty body
  }
  if (!res.ok) {
    return { ok: false, status: res.status, body: parsed }
  }
  return { ok: true, body: parsed }
}

function extractSidecarError(status: number, body: unknown): TelegramActionError {
  const msg = ((body as Record<string, unknown> | null)?.error as string | undefined) ?? `sidecar responded ${status}`
  if (status === 409 && (body as Record<string, unknown> | null)?.password_required === true) {
    return new TelegramActionError('passwordRequired', msg)
  }
  if (status === 429) {
    const retryAfter = (body as Record<string, unknown> | null)?.retry_after_seconds
    return new TelegramActionError(
      'floodWait',
      typeof retryAfter === 'number'
        ? `Telegram flood wait: ${retryAfter}s`
        : msg,
    )
  }
  if (status === 401) return new TelegramActionError('authRequired', msg)
  if (status === 404) return new TelegramActionError('notFound', msg)
  if (status === 400) return new TelegramActionError('invalidInput', msg)
  if (status === 503) return new TelegramActionError('sidecarUnavailable', msg)
  return new TelegramActionError('unknown', msg)
}

// ─── Actions ────────────────────────────────────────────────────────

/**
 * Starts a new Telegram connection. Creates a pending row in the DB
 * (status=PENDING), asks the sidecar to send an SMS code to the
 * phone, and returns the new connection id so the caller can present
 * the verify form.
 */
export async function startTelegramAuth(input: z.infer<typeof startAuthSchema>) {
  const session = await requireIngestionAdmin()
  const { label, phoneNumber } = startAuthSchema.parse(input)
  const ip = await getAuditRequestIp()

  const sessionRef = `sess-${randomUUID()}`
  const connection = await db.telegramIngestionConnection.create({
    data: {
      label,
      phoneNumberHash: phoneNumberHash(phoneNumber),
      sessionRef,
      status: 'PENDING',
      createdByUserId: session.user.id,
    },
  })

  const result = await callSidecar('/auth/start', {
    connection_id: connection.id,
    phone_number: phoneNumber,
  })
  if (!result.ok) {
    // Best-effort cleanup so a failed /auth/start doesn't leave a
    // half-created connection lying around.
    await db.telegramIngestionConnection.delete({ where: { id: connection.id } }).catch(() => {})
    throw extractSidecarError(result.status, result.body)
  }

  await createAuditLog({
    action: 'TELEGRAM_CONNECTION_CREATED',
    entityType: 'TelegramIngestionConnection',
    entityId: connection.id,
    actorId: session.user.id,
    actorRole: session.user.role,
    after: { id: connection.id, label, status: 'PENDING' },
    ip,
  })

  logger.info('ingestion.telegram.auth_started', {
    connectionId: connection.id,
    actorId: session.user.id,
  })
  safeRevalidatePath('/admin/ingestion/telegram')
  return { connectionId: connection.id }
}

/**
 * Completes a pending auth with the Telegram-delivered code. On 2FA
 * accounts the first call returns `passwordRequired`; the caller
 * retries with the user's Two-Step Verification password.
 */
export async function verifyTelegramAuth(input: z.infer<typeof verifyAuthSchema>) {
  const session = await requireIngestionAdmin()
  const { connectionId, code, password } = verifyAuthSchema.parse(input)
  const ip = await getAuditRequestIp()

  const connection = await db.telegramIngestionConnection.findUnique({
    where: { id: connectionId },
  })
  if (!connection) {
    throw new TelegramActionError('notFound', 'Connection not found')
  }
  if (connection.status === 'ACTIVE') {
    throw new TelegramActionError('alreadyActive', 'Connection is already active')
  }

  const result = await callSidecar('/auth/verify', {
    connection_id: connectionId,
    code,
    ...(password ? { password } : {}),
  })
  if (!result.ok) {
    throw extractSidecarError(result.status, result.body)
  }

  await db.telegramIngestionConnection.update({
    where: { id: connectionId },
    data: { status: 'ACTIVE' },
  })
  await createAuditLog({
    action: 'TELEGRAM_CONNECTION_AUTHORIZED',
    entityType: 'TelegramIngestionConnection',
    entityId: connectionId,
    actorId: session.user.id,
    actorRole: session.user.role,
    before: { status: connection.status },
    after: { status: 'ACTIVE' },
    ip,
  })

  logger.info('ingestion.telegram.auth_verified', {
    connectionId,
    actorId: session.user.id,
  })
  safeRevalidatePath('/admin/ingestion/telegram')
  return { ok: true }
}

export interface AvailableChat {
  tgChatId: string
  title: string
  kind: 'GROUP' | 'SUPERGROUP' | 'CHANNEL'
}

/**
 * Lists chats the logged-in Telegram account is a member of. The
 * admin UI uses this to let an operator pick which chats to enable
 * for ingestion; the caller is expected to filter out already-enabled
 * chats on its own.
 */
export async function listTelegramChats(
  input: z.infer<typeof listChatsSchema>,
): Promise<AvailableChat[]> {
  await requireIngestionAdmin()
  const { connectionId } = listChatsSchema.parse(input)
  const result = await callSidecar('/chats', { connection_id: connectionId })
  if (!result.ok) {
    throw extractSidecarError(result.status, result.body)
  }
  const body = (result.body as { chats?: AvailableChat[] } | null) ?? {}
  return body.chats ?? []
}

/**
 * Registers a chat for ingestion. The next `triggerSync` (or the
 * eventual scheduled sync) will pull messages from it.
 */
export async function enableIngestionChat(input: z.infer<typeof enableChatSchema>) {
  const session = await requireIngestionAdmin()
  const { connectionId, tgChatId, title, kind } = enableChatSchema.parse(input)
  const ip = await getAuditRequestIp()

  const connection = await db.telegramIngestionConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, status: true },
  })
  if (!connection) throw new TelegramActionError('notFound', 'Connection not found')
  if (connection.status !== 'ACTIVE') {
    throw new TelegramActionError(
      'connectionInactive',
      'Connection is not ACTIVE — complete /auth/verify first',
    )
  }

  const chat = await db.telegramIngestionChat.upsert({
    where: {
      connectionId_tgChatId: { connectionId, tgChatId: BigInt(tgChatId) },
    },
    create: {
      connectionId,
      tgChatId: BigInt(tgChatId),
      title,
      kind,
      isEnabled: true,
    },
    update: { isEnabled: true, title },
  })

  await createAuditLog({
    action: 'TELEGRAM_CHAT_ENABLED',
    entityType: 'TelegramIngestionChat',
    entityId: chat.id,
    actorId: session.user.id,
    actorRole: session.user.role,
    after: { tgChatId, title, kind },
    ip,
  })

  logger.info('ingestion.telegram.chat_enabled', {
    connectionId,
    chatId: chat.id,
    tgChatId,
    actorId: session.user.id,
  })
  safeRevalidatePath('/admin/ingestion/telegram')
  return { chatId: chat.id }
}

/**
 * Enqueues a pg-boss `telegram.sync` job for the given chat. The
 * worker picks it up and runs `telegramSyncHandler`, which paginates
 * messages through the provider and writes them into the raw tables.
 *
 * Rate-limited at one in-flight sync per chat via a singleton key so
 * double-clicks never produce duplicate work.
 */
export async function triggerChatSync(input: z.infer<typeof triggerSyncSchema>) {
  const session = await requireIngestionAdmin()
  const { chatId } = triggerSyncSchema.parse(input)
  const ip = await getAuditRequestIp()

  const chat = await db.telegramIngestionChat.findUnique({
    where: { id: chatId },
    select: { id: true, isEnabled: true, title: true },
  })
  if (!chat) throw new TelegramActionError('notFound', 'Chat not found')
  if (!chat.isEnabled) {
    throw new TelegramActionError('chatDisabled', 'Chat is not enabled for sync')
  }

  const jobId = await enqueue<{ chatId: string; correlationId: string }>(
    INGESTION_JOB_KINDS.telegramSync,
    {
      chatId: chat.id,
      correlationId: `manual-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    },
    { singletonKey: `telegram-sync:${chat.id}` },
  )

  await createAuditLog({
    action: 'TELEGRAM_SYNC_TRIGGERED',
    entityType: 'TelegramIngestionChat',
    entityId: chat.id,
    actorId: session.user.id,
    actorRole: session.user.role,
    after: { jobId, chatTitle: chat.title },
    ip,
  })

  logger.info('ingestion.telegram.sync_triggered', {
    chatId: chat.id,
    jobId,
    actorId: session.user.id,
  })
  safeRevalidatePath('/admin/ingestion/telegram')
  return { jobId }
}

const reprocessPendingSchema = z.object({
  chatId: z.string().min(1),
})

/**
 * Backfill action: enqueue `ingestion.processing.build-drafts` for
 * every raw message in this chat that does not yet have an
 * IngestionExtractionResult. Used to recover from the sync→processor
 * gap that existed before the chain fix landed (#890): hundreds of
 * raw rows ingested but never classified, sitting outside the review
 * queue with no path forward.
 *
 * Idempotent on top of pg-boss singleton keys + the processor's own
 * `(messageId, extractorVersion)` invariant. Safe to run repeatedly
 * — each invocation only touches messages still missing a result.
 */
export async function reprocessChatPending(
  input: z.infer<typeof reprocessPendingSchema>,
): Promise<{ enqueued: number }> {
  const session = await requireIngestionAdmin()
  const { chatId } = reprocessPendingSchema.parse(input)

  const chat = await db.telegramIngestionChat.findUnique({
    where: { id: chatId },
    select: { id: true, title: true },
  })
  if (!chat) throw new TelegramActionError('notFound', 'Chat not found')

  // Find every raw message in this chat with no extraction result.
  // Using $queryRawUnsafe + LEFT JOIN keeps the read narrow (id only)
  // and lets Postgres do the anti-join in one pass, vs. round-tripping
  // through Prisma `findMany` + `notIn`.
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT m.id FROM "TelegramIngestionMessage" m
       LEFT JOIN "IngestionExtractionResult" e ON e."messageId" = m.id
      WHERE m."chatId" = $1 AND e.id IS NULL
      ORDER BY m."postedAt" ASC`,
    chat.id,
  )

  let enqueued = 0
  const batchCorrelationId = `reprocess-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
  for (const row of rows) {
    try {
      await enqueue<{ messageId: string; correlationId: string }>(
        PROCESSING_JOB_KINDS.buildDrafts,
        { messageId: row.id, correlationId: `${batchCorrelationId}:${row.id.slice(-6)}` },
        { singletonKey: `process-message:${row.id}` },
      )
      enqueued++
    } catch (err) {
      logger.warn('ingestion.telegram.reprocess_enqueue_failed', {
        messageId: row.id,
        error: err,
        correlationId: batchCorrelationId,
      })
    }
  }

  logger.info('ingestion.telegram.reprocess_triggered', {
    chatId: chat.id,
    pending: rows.length,
    enqueued,
    correlationId: batchCorrelationId,
    actorId: session.user.id,
  })
  safeRevalidatePath('/admin/ingestion/telegram')
  return { enqueued }
}
