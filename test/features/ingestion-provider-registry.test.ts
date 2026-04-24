import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getTelegramProvider,
  resolveProviderCode,
  TelegramProviderConfigError,
  TELEGRAM_PROVIDER_ENV,
} from '@/domains/ingestion'

test('resolveProviderCode defaults to mock when env is unset', () => {
  assert.equal(resolveProviderCode({}), 'mock')
})

test('resolveProviderCode accepts "mock" / "telethon" case-insensitively', () => {
  assert.equal(resolveProviderCode({ [TELEGRAM_PROVIDER_ENV]: 'mock' }), 'mock')
  assert.equal(resolveProviderCode({ [TELEGRAM_PROVIDER_ENV]: 'Telethon' }), 'telethon')
  assert.equal(resolveProviderCode({ [TELEGRAM_PROVIDER_ENV]: 'TELETHON' }), 'telethon')
})

test('resolveProviderCode throws on unknown values (fail loud)', () => {
  assert.throws(
    () => resolveProviderCode({ [TELEGRAM_PROVIDER_ENV]: 'real' }),
    TelegramProviderConfigError,
  )
})

test('getTelegramProvider returns a mock provider by default', () => {
  const provider = getTelegramProvider({})
  assert.equal(provider.code, 'mock')
})

test('getTelegramProvider requires URL + token when telethon is selected', () => {
  assert.throws(
    () => getTelegramProvider({ [TELEGRAM_PROVIDER_ENV]: 'telethon' }),
    TelegramProviderConfigError,
  )
  assert.throws(
    () =>
      getTelegramProvider({
        [TELEGRAM_PROVIDER_ENV]: 'telethon',
        TELEGRAM_SIDECAR_URL: 'http://localhost:8088',
      }),
    TelegramProviderConfigError,
  )
})

test('getTelegramProvider wires Telethon HTTP when both URL + token are set', () => {
  const provider = getTelegramProvider({
    [TELEGRAM_PROVIDER_ENV]: 'telethon',
    TELEGRAM_SIDECAR_URL: 'http://localhost:8088',
    TELEGRAM_SIDECAR_TOKEN: 'secret',
  })
  assert.equal(provider.code, 'telethon')
})
