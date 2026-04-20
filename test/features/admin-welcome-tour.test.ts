import test from 'node:test'
import assert from 'node:assert/strict'
import es from '@/i18n/locales/es'
import en from '@/i18n/locales/en'

const WELCOME_KEYS = [
  'admin.welcome.stepCounter',
  'admin.welcome.intro.title',
  'admin.welcome.intro.body',
  'admin.welcome.step1.title',
  'admin.welcome.step1.body',
  'admin.welcome.step2.title',
  'admin.welcome.step2.body',
  'admin.welcome.step3.title',
  'admin.welcome.step3.body',
  'admin.welcome.step4.title',
  'admin.welcome.step4.body',
  'admin.welcome.step5.title',
  'admin.welcome.step5.body',
  'admin.welcome.step6.title',
  'admin.welcome.step6.body',
  'admin.welcome.start',
  'admin.welcome.next',
  'admin.welcome.back',
  'admin.welcome.skip',
  'admin.welcome.finish',
] as const

test('admin welcome keys exist in Spanish locale', () => {
  for (const key of WELCOME_KEYS) {
    const value = (es as Record<string, string>)[key]
    assert.ok(value, `es missing ${key}`)
    assert.notEqual(value, key)
  }
})

test('admin welcome keys exist in English locale', () => {
  for (const key of WELCOME_KEYS) {
    const value = (en as Record<string, string>)[key]
    assert.ok(value, `en missing ${key}`)
    assert.notEqual(value, key)
  }
})

test('admin intro.title contains {name} placeholder', () => {
  assert.ok((es as Record<string, string>)['admin.welcome.intro.title']?.includes('{name}'))
  assert.ok((en as Record<string, string>)['admin.welcome.intro.title']?.includes('{name}'))
})

test('admin stepCounter contains {current} and {total}', () => {
  for (const locale of [es, en]) {
    const v = (locale as Record<string, string>)['admin.welcome.stepCounter']
    assert.ok(v?.includes('{current}'))
    assert.ok(v?.includes('{total}'))
  }
})

test('admin welcome keys are symmetric across locales', () => {
  const esKeys = new Set(Object.keys(es).filter(k => k.startsWith('admin.welcome.')))
  const enKeys = new Set(Object.keys(en).filter(k => k.startsWith('admin.welcome.')))
  assert.deepEqual([...esKeys].sort(), [...enKeys].sort())
  assert.equal(esKeys.size, WELCOME_KEYS.length)
})
