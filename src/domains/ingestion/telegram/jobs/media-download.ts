import { logger } from '@/lib/logger'
import { generateCorrelationId } from '@/lib/correlation'
import { isIngestionKilled } from '@/domains/ingestion/flags'
import { INGESTION_JOB_KINDS } from '@/domains/ingestion/types'
import {
  TelegramAuthRequiredError,
  TelegramChatGoneError,
  TelegramProviderError,
  type TelegramIngestionProvider,
} from '@/domains/ingestion/telegram/providers'
import type {
  IngestionSyncDb,
  TelegramMediaDownloadJobData,
} from './types'

/**
 * `telegram.mediaDownload` handler — download one media item.
 *
 * Safety invariants (tested):
 *
 *   1. **Kill switch first.** Same early-exit as the sync handler.
 *   2. **Dedupe.** If the media already has a `blobKey`, the handler
 *      returns OK without touching the provider — Telegram often
 *      forwards the same file across chats and we pay the transfer
 *      cost exactly once per `fileUniqueId`.
 *   3. **Streaming + hard cap.** The provider yields an async
 *      iterable of bytes; we count chunks as they arrive and abort
 *      if the running total exceeds `mediaMaxBytes`. A cap breach
 *      marks the row `SKIPPED_OVERSIZE` and does NOT retry.
 *   4. **Typed error routing.**
 *        - `TelegramChatGoneError` → `SOURCE_GONE` (terminal).
 *        - `TelegramAuthRequiredError` → `FAILED` + rethrow so the
 *          worker surfaces the alert. Not retryable.
 *        - Other non-retryable provider errors → `FAILED` (terminal).
 *        - Retryable errors (Transport, FloodWait) → rethrow so
 *          pg-boss applies its backoff policy.
 *   5. **Never writes business tables.**
 */

const LOG_SCOPE = 'ingestion.telegram.media'

export interface MediaStoreResult {
  blobKey: string
  sizeBytes: number
  mimeType: string | null
}

/** Pluggable blob writer so tests don't touch disk. */
export type MediaStoreFn = (input: {
  fileUniqueId: string
  stream: AsyncIterable<Uint8Array>
  mimeType: string | null
  sizeHintBytes: number | null
  maxBytes: number
}) => Promise<MediaStoreResult>

export interface TelegramMediaDownloadDeps {
  db: IngestionSyncDb
  provider: TelegramIngestionProvider
  store: MediaStoreFn
  now: () => Date
  mediaMaxBytes: number
  isKilled?: (ctx: {
    correlationId: string
    messageMediaId: string
  }) => Promise<boolean>
}

export interface TelegramMediaDownloadOutcome {
  status: 'KILLED' | 'ALREADY_DONE' | 'OK' | 'SKIPPED_OVERSIZE' | 'SOURCE_GONE' | 'FAILED'
  messageMediaId: string
  correlationId: string
  sizeBytes: number | null
}

export class MediaOversizeError extends Error {
  constructor(readonly limitBytes: number, readonly observedBytes: number) {
    super(`media exceeds ${limitBytes}B cap (observed ≥ ${observedBytes}B)`)
    this.name = 'MediaOversizeError'
  }
}

export async function telegramMediaDownloadHandler(
  data: TelegramMediaDownloadJobData,
  deps: TelegramMediaDownloadDeps,
): Promise<TelegramMediaDownloadOutcome> {
  const correlationId = data.correlationId ?? generateCorrelationId()
  const isKilledFn = deps.isKilled ?? defaultKillProbe

  if (await isKilledFn({ correlationId, messageMediaId: data.messageMediaId })) {
    return result('KILLED', data.messageMediaId, correlationId, null)
  }

  const media = await deps.db.telegramIngestionMessageMedia.findUnique({
    where: { id: data.messageMediaId },
    include: {
      message: { include: { chat: { include: { connection: true } } } },
    },
  })
  if (!media) {
    logger.warn(`${LOG_SCOPE}.not_found`, {
      messageMediaId: data.messageMediaId,
      correlationId,
    })
    return result('FAILED', data.messageMediaId, correlationId, null)
  }

  // Dedupe: if we already have a blob key, we're done. Telegram
  // forwards are common — one fileUniqueId → one blob → many
  // messages.
  if (media.blobKey) {
    logger.info(`${LOG_SCOPE}.already_downloaded`, {
      messageMediaId: media.id,
      fileUniqueId: media.fileUniqueId,
      correlationId,
    })
    return result('ALREADY_DONE', media.id, correlationId, media.sizeBytes ?? null)
  }

  // Cheap pre-check: if the provider hinted a size and it's already
  // over the cap, don't even open the socket.
  if (media.sizeBytes !== null && media.sizeBytes > deps.mediaMaxBytes) {
    await deps.db.telegramIngestionMessageMedia.update({
      where: { id: media.id },
      data: {
        status: 'SKIPPED_OVERSIZE',
        lastErrorMsg: `pre-check: ${media.sizeBytes}B > ${deps.mediaMaxBytes}B`,
      },
    })
    logger.info(`${LOG_SCOPE}.skipped_oversize_precheck`, {
      messageMediaId: media.id,
      sizeBytes: media.sizeBytes,
      cap: deps.mediaMaxBytes,
      correlationId,
    })
    return result('SKIPPED_OVERSIZE', media.id, correlationId, media.sizeBytes)
  }

  const connectionId = media.message.chat.connectionId
  logger.info(`${LOG_SCOPE}.started`, {
    messageMediaId: media.id,
    fileUniqueId: media.fileUniqueId,
    correlationId,
  })

  try {
    const fetched = await deps.provider.fetchMedia({
      connectionId,
      fileUniqueId: media.fileUniqueId,
    })
    const stored = await deps.store({
      fileUniqueId: media.fileUniqueId,
      stream: fetched.stream,
      mimeType: fetched.mimeType,
      sizeHintBytes: fetched.sizeBytes,
      maxBytes: deps.mediaMaxBytes,
    })

    await deps.db.telegramIngestionMessageMedia.update({
      where: { id: media.id },
      data: {
        status: 'DOWNLOADED',
        blobKey: stored.blobKey,
        sizeBytes: stored.sizeBytes,
        mimeType: stored.mimeType ?? media.mimeType ?? undefined,
        downloadedAt: deps.now(),
      },
    })
    logger.info(`${LOG_SCOPE}.ok`, {
      messageMediaId: media.id,
      fileUniqueId: media.fileUniqueId,
      sizeBytes: stored.sizeBytes,
      correlationId,
    })
    return result('OK', media.id, correlationId, stored.sizeBytes)
  } catch (err) {
    if (err instanceof MediaOversizeError) {
      await deps.db.telegramIngestionMessageMedia.update({
        where: { id: media.id },
        data: {
          status: 'SKIPPED_OVERSIZE',
          lastErrorMsg: err.message.slice(0, 500),
        },
      })
      logger.warn(`${LOG_SCOPE}.skipped_oversize`, {
        messageMediaId: media.id,
        correlationId,
        error: err.message,
      })
      return result('SKIPPED_OVERSIZE', media.id, correlationId, err.observedBytes)
    }

    if (err instanceof TelegramChatGoneError) {
      await deps.db.telegramIngestionMessageMedia.update({
        where: { id: media.id },
        data: {
          status: 'SOURCE_GONE',
          lastErrorMsg: err.message.slice(0, 500),
        },
      })
      logger.warn(`${LOG_SCOPE}.source_gone`, {
        messageMediaId: media.id,
        correlationId,
      })
      return result('SOURCE_GONE', media.id, correlationId, null)
    }

    if (err instanceof TelegramAuthRequiredError) {
      await deps.db.telegramIngestionMessageMedia.update({
        where: { id: media.id },
        data: {
          status: 'FAILED',
          lastErrorMsg: err.message.slice(0, 500),
        },
      })
      logger.error(`${LOG_SCOPE}.auth_required`, {
        messageMediaId: media.id,
        correlationId,
        error: err,
      })
      throw err
    }

    if (err instanceof TelegramProviderError && !err.retryable) {
      await deps.db.telegramIngestionMessageMedia.update({
        where: { id: media.id },
        data: {
          status: 'FAILED',
          lastErrorMsg: err.message.slice(0, 500),
        },
      })
      logger.error(`${LOG_SCOPE}.failed_terminal`, {
        messageMediaId: media.id,
        correlationId,
        error: err,
      })
      return result('FAILED', media.id, correlationId, null)
    }

    // Retryable — record last-error diagnostics but leave status as
    // PENDING so the next attempt can pick up cleanly.
    await deps.db.telegramIngestionMessageMedia.update({
      where: { id: media.id },
      data: {
        lastErrorMsg: (err instanceof Error ? err.message : String(err)).slice(
          0,
          500,
        ),
      },
    })
    logger.warn(`${LOG_SCOPE}.retryable_error`, {
      messageMediaId: media.id,
      correlationId,
      error: err,
    })
    throw err
  }
}

function result(
  status: TelegramMediaDownloadOutcome['status'],
  messageMediaId: string,
  correlationId: string,
  sizeBytes: number | null,
): TelegramMediaDownloadOutcome {
  return { status, messageMediaId, correlationId, sizeBytes }
}

async function defaultKillProbe(ctx: {
  correlationId: string
  messageMediaId: string
}): Promise<boolean> {
  return isIngestionKilled(undefined, {
    correlationId: ctx.correlationId,
    jobKind: INGESTION_JOB_KINDS.telegramMediaDownload,
  })
}
