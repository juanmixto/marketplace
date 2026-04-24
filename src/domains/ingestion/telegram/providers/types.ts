/**
 * Contract between the ingestion worker and a Telegram data source.
 *
 * The contract is intentionally minimal: it transports raw messages
 * and media, nothing business-domain. Classification, extraction,
 * and draft creation live elsewhere and never know whether the
 * bytes came from Telethon, a mock, or a future direct client.
 *
 * Two implementations ship in Phase 1:
 *
 *   - `mock` — deterministic in-memory fixtures; default in
 *     development and tests.
 *   - `telethon` — HTTP bridge to the Python Telethon sidecar;
 *     never selected unless `INGESTION_TELEGRAM_PROVIDER=telethon`.
 *
 * The factory in `./registry.ts` wires env to implementation with
 * no module-level side effects.
 */

export type TelegramIngestionProviderCode = 'mock' | 'telethon'

// ─── Raw DTOs (provider → worker) ────────────────────────────────────────────

export interface RawTelegramChat {
  /** Telegram's numeric chat id. Serialized as string because JS Number
   *  cannot safely hold 64-bit ints; callers convert to BigInt at the
   *  Prisma boundary. */
  tgChatId: string
  title: string
  kind: 'GROUP' | 'SUPERGROUP' | 'CHANNEL'
}

export interface RawTelegramMessageMedia {
  fileUniqueId: string
  kind: 'PHOTO' | 'VIDEO' | 'DOCUMENT' | 'OTHER'
  mimeType: string | null
  /** Best-effort size hint; null when Telegram doesn't provide one. */
  sizeBytes: number | null
}

export interface RawTelegramMessage {
  /** Serialized 64-bit int (see RawTelegramChat.tgChatId). */
  tgMessageId: string
  /** Serialized 64-bit int; null for anonymous admin posts in channels. */
  tgAuthorId: string | null
  text: string | null
  postedAt: string // ISO-8601
  media: RawTelegramMessageMedia[]
  /** Raw provider payload preserved verbatim as source of truth. */
  raw: unknown
}

// ─── Input / output shapes ───────────────────────────────────────────────────

export interface FetchChatsInput {
  connectionId: string
  limit?: number
}
export interface FetchChatsResult {
  chats: RawTelegramChat[]
}

export interface FetchMessagesInput {
  connectionId: string
  tgChatId: string
  /** Incremental cursor. Pass `null` to fetch the newest batch. */
  fromMessageId: string | null
  /** Upper bound on messages returned. Providers may return fewer. */
  limit: number
}
export interface FetchMessagesResult {
  messages: RawTelegramMessage[]
  /** Highest tgMessageId seen in this batch, or `null` if empty.
   *  The worker advances the per-chat cursor to this value only
   *  after the batch lands in DB. */
  nextFromMessageId: string | null
}

export interface FetchMediaInput {
  connectionId: string
  fileUniqueId: string
}
export interface FetchMediaResult {
  /** Stream the body as chunks so large media never buffer fully
   *  in memory. Implementations SHOULD yield raw bytes; order is
   *  preserved. */
  stream: AsyncIterable<Uint8Array>
  mimeType: string | null
  sizeBytes: number | null
}

// ─── Provider interface ──────────────────────────────────────────────────────

export interface TelegramIngestionProvider {
  readonly code: TelegramIngestionProviderCode
  fetchChats(input: FetchChatsInput): Promise<FetchChatsResult>
  fetchMessages(input: FetchMessagesInput): Promise<FetchMessagesResult>
  fetchMedia(input: FetchMediaInput): Promise<FetchMediaResult>
}
