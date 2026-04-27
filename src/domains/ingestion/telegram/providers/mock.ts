import type {
  FetchChatsInput,
  FetchChatsResult,
  FetchMediaInput,
  FetchMediaResult,
  FetchMessagesInput,
  FetchMessagesResult,
  RawTelegramChat,
  RawTelegramMessage,
  TelegramIngestionProvider,
} from './types'
import { TelegramChatGoneError } from './errors'

/**
 * Deterministic in-memory provider. Default in dev and tests.
 *
 * The fixture is a simple Map of chats → messages. Tests can pass
 * their own fixture to `createMockProvider` to drive scenarios.
 * Cursor semantics mirror the contract: `fromMessageId=null` returns
 * the newest batch; otherwise returns messages with `tgMessageId > fromMessageId`.
 * Messages are sorted ascending so the batch's last id is the next cursor.
 */

export interface MockFixture {
  chats: RawTelegramChat[]
  /** Keyed by tgChatId. */
  messages: Record<string, RawTelegramMessage[]>
  /** Media bytes keyed by fileUniqueId. */
  media?: Record<string, Uint8Array>
}

const EMPTY_FIXTURE: MockFixture = { chats: [], messages: {} }

export function createMockProvider(
  fixture: MockFixture = EMPTY_FIXTURE,
): TelegramIngestionProvider {
  return {
    code: 'mock',

    async fetchChats({ limit }: FetchChatsInput): Promise<FetchChatsResult> {
      const chats = limit ? fixture.chats.slice(0, limit) : fixture.chats
      return { chats }
    },

    async fetchMessages({
      tgChatId,
      fromMessageId,
      limit,
    }: FetchMessagesInput): Promise<FetchMessagesResult> {
      const all = fixture.messages[tgChatId]
      if (!all) {
        throw new TelegramChatGoneError(
          `mock: unknown chat ${tgChatId}`,
          tgChatId,
        )
      }
      // Sort ascending by numeric id so cursor advance is deterministic.
      const sorted = [...all].sort((a, b) => numericCompare(a.tgMessageId, b.tgMessageId))
      const filtered =
        fromMessageId === null
          ? sorted
          : sorted.filter((m) => numericCompare(m.tgMessageId, fromMessageId) > 0)
      const batch = filtered.slice(0, limit)
      const last = batch[batch.length - 1]
      return {
        messages: batch,
        nextFromMessageId: last ? last.tgMessageId : null,
      }
    },

    async fetchMedia({ fileUniqueId }: FetchMediaInput): Promise<FetchMediaResult> {
      const bytes = fixture.media?.[fileUniqueId]
      if (!bytes) {
        throw new TelegramChatGoneError(
          `mock: unknown media ${fileUniqueId}`,
        )
      }
      // Wrap in a single-chunk async iterable so tests exercise the
      // streaming contract even with tiny payloads.
      return {
        stream: (async function* () {
          yield bytes
        })(),
        mimeType: 'application/octet-stream',
        sizeBytes: bytes.byteLength,
      }
    },

    async fetchTopics() {
      // Mock fixtures are flat lists of messages, no forum topics.
      // Returning [] makes the worker take the "main feed only"
      // branch, which exercises the same code path the real
      // (non-forum) chats follow in production.
      return { topics: [] }
    },
  }
}

function numericCompare(a: string, b: string): number {
  // Compare as BigInt because string compare misorders unequal-length
  // decimal strings (e.g. "9" vs "10").
  const ba = BigInt(a)
  const bb = BigInt(b)
  return ba < bb ? -1 : ba > bb ? 1 : 0
}
