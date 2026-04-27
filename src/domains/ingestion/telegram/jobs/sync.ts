import { logger } from '@/lib/logger'
import { generateCorrelationId } from '@/lib/correlation'
import { isIngestionKilled } from '@/domains/ingestion/flags'
import { INGESTION_JOB_KINDS } from '@/domains/ingestion/types'
import {
  TelegramChatGoneError,
  TelegramProviderError,
  type FetchMessagesResult,
  type RawTelegramMessageMedia,
  type TelegramIngestionProvider,
} from '@/domains/ingestion/telegram/providers'
import type {
  ChatWithConnection,
  IngestionSyncDb,
  TelegramSyncJobData,
} from './types'

/**
 * `telegram.sync` handler — incremental fetch of one chat.
 *
 * Safety invariants (tested):
 *
 *   1. **Kill switch first.** The very first operation is the kill
 *      check; if killed, the handler returns before any I/O.
 *   2. **Strictly incremental.** `fromMessageId` is the previously
 *      persisted cursor, so we never re-pull history. If the cursor
 *      is `null` the provider is free to return the newest window;
 *      expanding that window into a backfill is explicitly out of
 *      scope and has to be a manual admin tool in a later phase.
 *   3. **Atomic batch.** Message upserts, media-row upserts, cursor
 *      advance, and sync-run bookkeeping run in one transaction.
 *      Mid-batch crash → rollback → next run re-reads → `@@unique`
 *      dedupes. No gaps, no duplicates.
 *   4. **No side effects outside raw tables.** Never writes to
 *      Product / Vendor / ProductImage. Media download is a
 *      separate job that the worker enqueues best-effort after the
 *      transaction commits.
 */

const LOG_SCOPE = 'ingestion.telegram.sync'

export interface TelegramSyncDeps {
  db: IngestionSyncDb
  provider: TelegramIngestionProvider
  enqueueMediaDownload: (input: {
    messageMediaId: string
    fileUniqueId: string
    correlationId: string
  }) => Promise<void>
  /** Best-effort: kick the Phase 2 processor for each message just
   *  ingested. The processor is idempotent (keyed by messageId +
   *  extractorVersion) so re-enqueueing on a no-op batch is harmless. */
  enqueueProcessMessage?: (input: {
    messageId: string
    correlationId: string
  }) => Promise<void>
  now: () => Date
  batchSize: number
  /** Injected kill-switch probe so tests don't depend on PostHog.
   *  Defaults to the real helper. */
  isKilled?: (ctx: { correlationId: string; chatId: string }) => Promise<boolean>
}

export interface TelegramSyncOutcome {
  status: 'KILLED' | 'CHAT_DISABLED' | 'OK' | 'FAILED'
  syncRunId: string | null
  messagesFetched: number
  mediaQueued: number
  correlationId: string
}

export async function telegramSyncHandler(
  data: TelegramSyncJobData,
  deps: TelegramSyncDeps,
): Promise<TelegramSyncOutcome> {
  const correlationId = data.correlationId ?? generateCorrelationId()
  const isKilledFn = deps.isKilled ?? defaultKillProbe

  // 1. Kill switch — BEFORE any I/O.
  if (await isKilledFn({ correlationId, chatId: data.chatId })) {
    return {
      status: 'KILLED',
      syncRunId: null,
      messagesFetched: 0,
      mediaQueued: 0,
      correlationId,
    }
  }

  // 2. Load chat. Missing or disabled chats short-circuit without a
  //    sync-run row; logging makes the skip obvious for operators.
  const chat = await deps.db.telegramIngestionChat.findUnique({
    where: { id: data.chatId },
    include: { connection: true },
  })
  if (!chat) {
    logger.warn(`${LOG_SCOPE}.chat_not_found`, {
      chatId: data.chatId,
      correlationId,
    })
    return outcome('CHAT_DISABLED', null, 0, 0, correlationId)
  }
  if (!chat.isEnabled) {
    logger.info(`${LOG_SCOPE}.skipped_disabled`, {
      chatId: chat.id,
      correlationId,
    })
    return outcome('CHAT_DISABLED', null, 0, 0, correlationId)
  }
  if (chat.connection.status !== 'ACTIVE') {
    logger.info(`${LOG_SCOPE}.skipped_inactive_connection`, {
      chatId: chat.id,
      connectionStatus: chat.connection.status,
      correlationId,
    })
    return outcome('CHAT_DISABLED', null, 0, 0, correlationId)
  }

  // 3. Open a sync-run row. Failures from here on must mark this row
  //    FAILED so operators see the error tail in the admin panel.
  const run = await deps.db.telegramIngestionSyncRun.create({
    data: {
      chatId: chat.id,
      correlationId,
      fromMessageId: chat.lastMessageId ?? null,
    },
  })
  logger.info(`${LOG_SCOPE}.started`, {
    syncRunId: run.id,
    chatId: chat.id,
    fromMessageId: chat.lastMessageId?.toString() ?? null,
    batchSize: deps.batchSize,
    correlationId,
  })

  // 4. Fetch + persist in one transaction.
  try {
    // Resolve forum topic titles once per sync run. Empty list means
    // "this chat is not a forum / has no topics" — every message
    // will be persisted with topicId=null. We swallow errors here on
    // purpose: a topic-listing failure must not block raw ingestion,
    // it just degrades to "stats won't show topic breakdown until
    // the next successful sync".
    const topicTitles = await loadTopicTitles({
      provider: deps.provider,
      connectionId: chat.connection.id,
      tgChatId: chat.tgChatId.toString(),
      correlationId,
    })

    const fetched = await deps.provider.fetchMessages({
      connectionId: chat.connection.id,
      tgChatId: chat.tgChatId.toString(),
      fromMessageId: chat.lastMessageId?.toString() ?? null,
      limit: deps.batchSize,
    })

    const { mediaQueued } = await persistBatch({
      chat,
      fetched,
      deps,
      correlationId,
      topicTitles,
    })

    await deps.db.telegramIngestionSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'OK',
        finishedAt: deps.now(),
        messagesFetched: fetched.messages.length,
        mediaFetched: mediaQueued,
        toMessageId:
          fetched.nextFromMessageId !== null
            ? BigInt(fetched.nextFromMessageId)
            : null,
      },
    })

    logger.info(`${LOG_SCOPE}.ok`, {
      syncRunId: run.id,
      chatId: chat.id,
      messagesFetched: fetched.messages.length,
      mediaQueued,
      nextFromMessageId: fetched.nextFromMessageId,
      correlationId,
    })

    return outcome('OK', run.id, fetched.messages.length, mediaQueued, correlationId)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await deps.db.telegramIngestionSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        finishedAt: deps.now(),
        errorMessage: errorMessage.slice(0, 2_000),
      },
    })

    // Chat-gone is a permanent terminal state — disable the chat so
    // future scheduled syncs don't thrash against a removed target.
    if (err instanceof TelegramChatGoneError) {
      await deps.db.telegramIngestionChat.update({
        where: { id: chat.id },
        data: {
          isEnabled: false,
          disabledReason: err.message.slice(0, 500),
        },
      })
      logger.warn(`${LOG_SCOPE}.chat_gone_disabled`, {
        syncRunId: run.id,
        chatId: chat.id,
        correlationId,
      })
      return outcome('FAILED', run.id, 0, 0, correlationId)
    }

    logger.error(`${LOG_SCOPE}.failed`, {
      syncRunId: run.id,
      chatId: chat.id,
      correlationId,
      error: err,
      retryable:
        err instanceof TelegramProviderError ? err.retryable : true,
    })
    // Rethrow so pg-boss records the failure and retries per policy.
    throw err
  }
}

async function loadTopicTitles(input: {
  provider: TelegramSyncDeps['provider']
  connectionId: string
  tgChatId: string
  correlationId: string
}): Promise<Map<string, string>> {
  const { provider, connectionId, tgChatId, correlationId } = input
  if (typeof provider.fetchTopics !== 'function') return new Map()
  try {
    const { topics } = await provider.fetchTopics({ connectionId, tgChatId })
    const map = new Map<string, string>()
    for (const t of topics) map.set(t.id, t.title)
    return map
  } catch (err) {
    logger.warn(`${LOG_SCOPE}.topics_fetch_failed`, {
      connectionId,
      tgChatId,
      error: err instanceof Error ? err.message : String(err),
      correlationId,
    })
    return new Map()
  }
}

async function persistBatch(input: {
  chat: ChatWithConnection
  fetched: FetchMessagesResult
  deps: TelegramSyncDeps
  correlationId: string
  topicTitles: Map<string, string>
}): Promise<{ mediaQueued: number }> {
  const { chat, fetched, deps, correlationId, topicTitles } = input
  const mediaToEnqueue: Array<{ messageMediaId: string; fileUniqueId: string }> = []
  // Phase 2 processing: every message just upserted is a candidate
  // for the rules pipeline. The processor handler is idempotent
  // (`messageId + extractorVersion` keys the draft), so enqueuing on
  // re-syncs is safe. We do this best-effort post-commit so a queue
  // hiccup never rolls back the raw ingestion.
  const messagesToProcess: string[] = []
  // Dedupe within the batch: if two messages reference the same
  // fileUniqueId, upsert returns the same PENDING row both times,
  // but we only want one download job.
  const alreadyQueued = new Set<string>()

  await deps.db.$transaction(async (tx) => {
    for (const msg of fetched.messages) {
      const createdMessage = await tx.telegramIngestionMessage.upsert({
        where: {
          chatId_tgMessageId: {
            chatId: chat.id,
            tgMessageId: BigInt(msg.tgMessageId),
          },
        },
        create: {
          chatId: chat.id,
          tgMessageId: BigInt(msg.tgMessageId),
          tgAuthorId: msg.tgAuthorId !== null ? BigInt(msg.tgAuthorId) : null,
          text: msg.text,
          postedAt: new Date(msg.postedAt),
          rawJson: msg.raw,
          topicId: msg.topicId != null ? BigInt(msg.topicId) : null,
          topicTitle:
            msg.topicId != null ? (topicTitles.get(msg.topicId) ?? null) : null,
        },
        update: {}, // existing rows preserved (including tombstones)
      })
      messagesToProcess.push(createdMessage.id)

      for (const media of msg.media) {
        const mediaRow = await tx.telegramIngestionMessageMedia.upsert({
          where: { fileUniqueId: media.fileUniqueId },
          create: mediaCreateInput(createdMessage.id, media),
          update: {},
        })
        // Enqueue a download only if the row is still PENDING AND
        // we haven't already queued it earlier in this batch.
        // Already-downloaded media is left alone (dedupe invariant).
        if (
          mediaRow.status === 'PENDING' &&
          mediaRow.blobKey === null &&
          !alreadyQueued.has(media.fileUniqueId)
        ) {
          alreadyQueued.add(media.fileUniqueId)
          mediaToEnqueue.push({
            messageMediaId: mediaRow.id,
            fileUniqueId: media.fileUniqueId,
          })
        }
      }
    }

    // 5. Advance cursor. Only when the batch committed; a throw
    //    above rolls back together with all the upserts.
    if (fetched.nextFromMessageId !== null) {
      await tx.telegramIngestionChat.update({
        where: { id: chat.id },
        data: { lastMessageId: BigInt(fetched.nextFromMessageId) },
      })
    }
  })

  // 6. Best-effort media enqueue AFTER commit so we never tie up a
  //    DB transaction on queue I/O.
  let queued = 0
  for (const m of mediaToEnqueue) {
    try {
      await deps.enqueueMediaDownload({ ...m, correlationId })
      queued++
    } catch (err) {
      // Leaving the media row as PENDING is the correct state; a
      // later sweeper (Phase 6) picks it up. Logged loudly so
      // operators notice queue issues.
      logger.warn(`${LOG_SCOPE}.media_enqueue_failed`, {
        messageMediaId: m.messageMediaId,
        fileUniqueId: m.fileUniqueId,
        error: err,
        correlationId,
      })
    }
  }

  // 7. Best-effort processor fan-out. Same post-commit pattern as
  //    media: a queue blip must not lose raw messages already on
  //    disk. The processor's stage flag + kill switch decide whether
  //    the work actually runs; this just hands it the candidate.
  if (deps.enqueueProcessMessage) {
    for (const messageId of messagesToProcess) {
      try {
        await deps.enqueueProcessMessage({ messageId, correlationId })
      } catch (err) {
        logger.warn(`${LOG_SCOPE}.process_enqueue_failed`, {
          messageId,
          error: err,
          correlationId,
        })
      }
    }
  }

  return { mediaQueued: queued }
}

function mediaCreateInput(
  messageId: string,
  media: RawTelegramMessageMedia,
): {
  messageId: string
  fileUniqueId: string
  kind: 'PHOTO' | 'VIDEO' | 'DOCUMENT' | 'OTHER'
  mimeType: string | null
  sizeBytes: number | null
} {
  return {
    messageId,
    fileUniqueId: media.fileUniqueId,
    kind: media.kind,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
  }
}

function outcome(
  status: TelegramSyncOutcome['status'],
  syncRunId: string | null,
  messagesFetched: number,
  mediaQueued: number,
  correlationId: string,
): TelegramSyncOutcome {
  return { status, syncRunId, messagesFetched, mediaQueued, correlationId }
}

async function defaultKillProbe(ctx: {
  correlationId: string
  chatId: string
}): Promise<boolean> {
  return isIngestionKilled(undefined, {
    correlationId: ctx.correlationId,
    chatId: ctx.chatId,
    jobKind: INGESTION_JOB_KINDS.telegramSync,
  })
}
