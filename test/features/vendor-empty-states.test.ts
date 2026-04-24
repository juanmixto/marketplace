import test from 'node:test'
import assert from 'node:assert/strict'
import es from '@/i18n/locales/es'
import en from '@/i18n/locales/en'

const KEYS = [
  'vendor.noProductsTitle',
  'vendor.noProductsBody',
  'vendor.orders.emptyTitle',
  'vendor.orders.emptyBody',
  'vendor.orders.emptyCta',
] as const

test('empty-state keys exist in Spanish locale', () => {
  for (const key of KEYS) {
    const value = (es as Record<string, string>)[key]
    assert.ok(value, `es missing ${key}`)
    assert.notEqual(value, key)
  }
})

test('empty-state keys exist in English locale', () => {
  for (const key of KEYS) {
    const value = (en as Record<string, string>)[key]
    assert.ok(value, `en missing ${key}`)
    assert.notEqual(value, key)
  }
})
