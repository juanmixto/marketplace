/**
 * Public surface of the Telegram ingestion provider layer. The
 * top-level ingestion barrel re-exports from here so consumers
 * never deep-import into individual files.
 */

export type {
  TelegramIngestionProvider,
  TelegramIngestionProviderCode,
  RawTelegramChat,
  RawTelegramMessage,
  RawTelegramMessageMedia,
  FetchChatsInput,
  FetchChatsResult,
  FetchMessagesInput,
  FetchMessagesResult,
  FetchMediaInput,
  FetchMediaResult,
} from './types'

export {
  TelegramProviderError,
  TelegramTransportError,
  TelegramBadResponseError,
  TelegramAuthRequiredError,
  TelegramFloodWaitError,
  TelegramChatGoneError,
} from './errors'

export { createMockProvider, type MockFixture } from './mock'
export { createTelethonHttpProvider, type TelethonHttpProviderConfig } from './telethon-http'
export {
  getTelegramProvider,
  resolveProviderCode,
  TELEGRAM_PROVIDER_ENV,
  TelegramProviderConfigError,
} from './registry'
