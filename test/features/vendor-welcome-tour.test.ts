import test from 'node:test'
import assert from 'node:assert/strict'
import es from '@/i18n/locales/es'
import en from '@/i18n/locales/en'

const WELCOME_KEYS = [
  'vendor.welcome.badge',
  'vendor.welcome.intro.title',
  'vendor.welcome.intro.body',
  'vendor.welcome.step1.title',
  'vendor.welcome.step1.body',
  'vendor.welcome.step2.title',
  'vendor.welcome.step2.body',
  'vendor.welcome.step3.title',
  'vendor.welcome.step3.body',
  'vendor.welcome.step4.title',
  'vendor.welcome.step4.body',
  'vendor.welcome.step5.title',
  'vendor.welcome.step5.body',
  'vendor.welcome.step6.title',
  'vendor.welcome.step6.body',
  'vendor.welcome.next',
  'vendor.welcome.back',
  'vendor.welcome.skip',
  'vendor.welcome.finish',
] as const

test('welcome tour keys exist in Spanish locale and are non-empty', () => {
  for (const key of WELCOME_KEYS) {
    const value = (es as Record<string, string>)[key]
    assert.ok(value, `es missing key ${key}`)
    assert.notEqual(value, key, `es[${key}] must not equal the key itself`)
  }
})

test('welcome tour keys exist in English locale and are non-empty', () => {
  for (const key of WELCOME_KEYS) {
    const value = (en as Record<string, string>)[key]
    assert.ok(value, `en missing key ${key}`)
    assert.notEqual(value, key, `en[${key}] must not equal the key itself`)
  }
})

test('intro.title contains {name} placeholder for both locales', () => {
  assert.ok((es as Record<string, string>)['vendor.welcome.intro.title']?.includes('{name}'))
  assert.ok((en as Record<string, string>)['vendor.welcome.intro.title']?.includes('{name}'))
})

test('welcome keys are present in both locales symmetrically', () => {
  const esKeys = new Set(Object.keys(es).filter(k => k.startsWith('vendor.welcome.')))
  const enKeys = new Set(Object.keys(en).filter(k => k.startsWith('vendor.welcome.')))
  assert.deepEqual([...esKeys].sort(), [...enKeys].sort())
  assert.equal(esKeys.size, WELCOME_KEYS.length)
})
