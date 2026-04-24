import test from 'node:test'
import assert from 'node:assert/strict'
import es from '@/i18n/locales/es'
import en from '@/i18n/locales/en'

const KEYS = [
  'vendor.firstSale.badge',
  'vendor.firstSale.title',
  'vendor.firstSale.body',
  'vendor.firstSale.tip1',
  'vendor.firstSale.tip2',
  'vendor.firstSale.tip3',
  'vendor.firstSale.goToOrder',
  'vendor.firstSale.dismiss',
] as const

test('firstSale keys exist in Spanish locale', () => {
  for (const key of KEYS) {
    const value = (es as Record<string, string>)[key]
    assert.ok(value, `es missing ${key}`)
    assert.notEqual(value, key)
  }
})

test('firstSale keys exist in English locale', () => {
  for (const key of KEYS) {
    const value = (en as Record<string, string>)[key]
    assert.ok(value, `en missing ${key}`)
    assert.notEqual(value, key)
  }
})

test('firstSale.title contains {name} placeholder', () => {
  assert.ok((es as Record<string, string>)['vendor.firstSale.title']?.includes('{name}'))
  assert.ok((en as Record<string, string>)['vendor.firstSale.title']?.includes('{name}'))
})

test('firstSale keys are symmetric across locales', () => {
  const esKeys = new Set(Object.keys(es).filter(k => k.startsWith('vendor.firstSale.')))
  const enKeys = new Set(Object.keys(en).filter(k => k.startsWith('vendor.firstSale.')))
  assert.deepEqual([...esKeys].sort(), [...enKeys].sort())
  assert.equal(esKeys.size, KEYS.length)
})
