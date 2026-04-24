/**
 * Job payload shapes + handler-dependency interfaces.
 *
 * Handlers are written as pure functions that accept a `deps` object
 * so tests inject a fake db / provider / clock without touching real
 * infrastructure. Production wrappers in `src/workers/jobs/*.ts` wire
 * the same handlers to the real `db`, provider registry, and queue.
 */

export interface TelegramSyncJobData {
  chatId: string
  /** Optional correlation id forwarded from the enqueuing request so
   *  one admin "trigger sync" trace threads through the worker. */
  correlationId?: string
}

export interface TelegramMediaDownloadJobData {
  messageMediaId: string
  correlationId?: string
}

// ─── Row shapes the handlers read ────────────────────────────────────────────
//
// Defined locally so tests don't have to reach into the generated
// Prisma types. The real Prisma rows are a superset; assignment
// works because every field declared here also exists on the
// generated model row.

export interface TelegramIngestionChatRow {
  id: string
  connectionId: string
  tgChatId: bigint
  title: string
  kind: 'GROUP' | 'SUPERGROUP' | 'CHANNEL'
  lastMessageId: bigint | null
  isEnabled: boolean
  disabledReason: string | null
}

export interface ChatWithConnection extends TelegramIngestionChatRow {
  connection: { id: string; status: string }
}

export interface TelegramIngestionMessageRow {
  id: string
  chatId: string
  tgMessageId: bigint
}

export interface TelegramIngestionMessageMediaRow {
  id: string
  messageId: string
  fileUniqueId: string
  kind: 'PHOTO' | 'VIDEO' | 'DOCUMENT' | 'OTHER'
  status:
    | 'PENDING'
    | 'DOWNLOADED'
    | 'SKIPPED_OVERSIZE'
    | 'SOURCE_GONE'
    | 'FAILED'
  blobKey: string | null
  sizeBytes: number | null
  mimeType: string | null
}

export interface MessageMediaWithMessage extends TelegramIngestionMessageMediaRow {
  message: {
    chatId: string
    chat: {
      connectionId: string
      tgChatId: bigint
      connection: { id: string; status: string }
    }
  }
}

export interface TelegramIngestionSyncRunRow {
  id: string
  chatId: string
}

// ─── Narrow DB interface ─────────────────────────────────────────────────────
//
// Only the surface the handlers call. The real `db` from `@/lib/db`
// is a superset; a test fake only implements what the test drives.

export interface IngestionSyncDb {
  telegramIngestionChat: {
    findUnique(args: {
      where: { id: string }
      include?: { connection: true }
    }): Promise<ChatWithConnection | null>
    update(args: {
      where: { id: string }
      data: { lastMessageId?: bigint; disabledReason?: string; isEnabled?: boolean }
    }): Promise<TelegramIngestionChatRow>
  }
  telegramIngestionSyncRun: {
    create(args: {
      data: {
        chatId: string
        correlationId: string
        fromMessageId?: bigint | null
      }
    }): Promise<TelegramIngestionSyncRunRow>
    update(args: {
      where: { id: string }
      data: Partial<{
        status: 'RUNNING' | 'OK' | 'FAILED' | 'CANCELLED'
        finishedAt: Date
        toMessageId: bigint | null
        messagesFetched: number
        mediaFetched: number
        errorMessage: string
      }>
    }): Promise<TelegramIngestionSyncRunRow>
  }
  telegramIngestionMessage: {
    upsert(args: {
      where: { chatId_tgMessageId: { chatId: string; tgMessageId: bigint } }
      create: {
        chatId: string
        tgMessageId: bigint
        tgAuthorId: bigint | null
        text: string | null
        postedAt: Date
        rawJson: unknown
      }
      update: Record<string, never>
    }): Promise<TelegramIngestionMessageRow>
  }
  telegramIngestionMessageMedia: {
    upsert(args: {
      where: { fileUniqueId: string }
      create: {
        messageId: string
        fileUniqueId: string
        kind: 'PHOTO' | 'VIDEO' | 'DOCUMENT' | 'OTHER'
        mimeType: string | null
        sizeBytes: number | null
      }
      update: Record<string, never>
    }): Promise<TelegramIngestionMessageMediaRow>
    findUnique(args: {
      where: { id: string }
      include?: {
        message: {
          include: { chat: { include: { connection: true } } }
        }
      }
    }): Promise<MessageMediaWithMessage | null>
    update(args: {
      where: { id: string }
      data: Partial<{
        status:
          | 'PENDING'
          | 'DOWNLOADED'
          | 'SKIPPED_OVERSIZE'
          | 'SOURCE_GONE'
          | 'FAILED'
        blobKey: string
        sizeBytes: number
        mimeType: string
        downloadedAt: Date
        lastErrorMsg: string
      }>
    }): Promise<TelegramIngestionMessageMediaRow>
  }
  $transaction<T>(fn: (tx: IngestionSyncDb) => Promise<T>): Promise<T>
}
