import test from 'node:test'
import assert from 'node:assert/strict'
import es from '@/i18n/locales/es'
import en from '@/i18n/locales/en'

// TypeScript already enforces at compile time that en.ts is Record<keyof typeof es, string>.
// The tests below are the runtime belt-and-suspenders that also catch copy/paste bugs,
// placeholder drift, and empty strings — things the type system cannot see.

type LocaleMap = Record<string, string>

const esMap = es as unknown as LocaleMap
const enMap = en as unknown as LocaleMap

const esKeys = Object.keys(esMap).sort()
const enKeys = Object.keys(enMap).sort()

/**
 * Keys we intentionally leave identical between locales because they are
 * proper nouns, brand names, product names, or untranslatable acronyms.
 * Add new entries here with a short justification to keep this list honest.
 */
const INTENTIONAL_COPY_KEYS = new Set<string>([
  // Words that are internationally identical or brand-style labels.
  'account.cityPlaceholder',      // city name placeholder (e.g. "Madrid")
  'account.profileEmailLabel',    // "Email" is the same word in both locales
  'auth.recoveryEmail',           // "recovery@example.com" placeholder
  'cart.subtotal',                // "Subtotal" is the same word in both locales
  'cart.total',                   // "Total" is the same word in both locales
  'checkout.postalCodePlaceholder', // numeric example (e.g. "28001")
  'cookies',                      // "Cookies" is the same word in both locales (footer link)
  'km0',                          // brand/label for "zero-kilometer" products
  'lang_en',                      // language name shown in its own language
  'lang_es',                      // language name shown in its own language
  'order.subtotal',
  'order.total',
  'vendor.stock',                 // "Stock" reads the same in ES and EN
  'vendor.profileForm.ibanLabel', // "IBAN" is an untranslatable acronym
])

/**
 * Extract placeholder tokens like {count}, {name}, {{foo}} so we can
 * detect mismatches between locales.
 */
function extractPlaceholders(value: string): string[] {
  const matches = value.match(/\{\{?[^{}]+\}?\}/g) ?? []
  return matches.map((m) => m.replace(/\s+/g, '')).sort()
}

test('es and en have exactly the same set of translation keys', () => {
  assert.deepEqual(enKeys, esKeys)
})

test('every key has a non-empty string value in both locales', () => {
  for (const key of esKeys) {
    assert.equal(typeof esMap[key], 'string', `es.${key} should be a string`)
    assert.equal(typeof enMap[key], 'string', `en.${key} should be a string`)
    assert.ok(esMap[key]!.length > 0, `es.${key} should not be empty`)
    assert.ok(enMap[key]!.length > 0, `en.${key} should not be empty`)
  }
})

test('no English value is accidentally a copy of the Spanish value', () => {
  const offenders: string[] = []
  for (const key of esKeys) {
    if (INTENTIONAL_COPY_KEYS.has(key)) continue
    if (esMap[key] === enMap[key]) {
      offenders.push(key)
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Keys with identical es/en values (likely forgotten translation): ${offenders.join(', ')}`
  )
})

test('placeholder tokens are preserved across locales', () => {
  const mismatches: Array<{ key: string; es: string[]; en: string[] }> = []
  for (const key of esKeys) {
    const esPlaceholders = extractPlaceholders(esMap[key]!)
    const enPlaceholders = extractPlaceholders(enMap[key]!)
    const esSet = new Set(esPlaceholders)
    const enSet = new Set(enPlaceholders)
    const sameShape =
      esSet.size === enSet.size && [...esSet].every((p) => enSet.has(p))
    if (!sameShape) {
      mismatches.push({ key, es: esPlaceholders, en: enPlaceholders })
    }
  }
  assert.deepEqual(
    mismatches,
    [],
    `Placeholder mismatch between es/en: ${JSON.stringify(mismatches, null, 2)}`
  )
})
