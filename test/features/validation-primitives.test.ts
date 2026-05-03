import test from 'node:test'
import assert from 'node:assert/strict'
import {
  zEmail,
  zCuid,
  zSlug,
  zMoneyEUR,
  zPhoneES,
  zSafeText,
} from '@/lib/validation/primitives'

test('zEmail trims, lowercases, rejects malformed', () => {
  assert.equal(zEmail.parse('  JUAN@X.com '), 'juan@x.com')
  assert.throws(() => zEmail.parse('not-an-email'))
  assert.throws(() => zEmail.parse('a@b.c' + 'x'.repeat(260)))
})

test('zCuid accepts cuid shape, rejects arbitrary strings', () => {
  assert.equal(
    zCuid.parse('clx0123456789abcdef0123'),
    'clx0123456789abcdef0123'
  )
  assert.throws(() => zCuid.parse('../../etc/passwd'))
  assert.throws(() => zCuid.parse(''))
  assert.throws(() => zCuid.parse('not-a-cuid'))
})

test('zSlug runs slugify and rejects empty result', () => {
  assert.equal(zSlug.parse('Café-Raíz'), 'cafe-raiz')
  assert.equal(zSlug.parse('  Mi Vendor  '), 'mi-vendor')
  // Pure punctuation collapses to empty after slugify
  assert.throws(() => zSlug.parse('---!!!'))
})

test('zMoneyEUR accepts strings, rejects NaN/negatives/Infinity', () => {
  assert.equal(zMoneyEUR.parse('12.50'), 12.5)
  assert.equal(zMoneyEUR.parse('1,99'), 1.99)
  assert.equal(zMoneyEUR.parse(0), 0)
  assert.throws(() => zMoneyEUR.parse('abc'))
  assert.throws(() => zMoneyEUR.parse(NaN))
  assert.throws(() => zMoneyEUR.parse(-5))
  assert.throws(() => zMoneyEUR.parse(Infinity))
  assert.throws(() => zMoneyEUR.parse(1e308))
  // 3+ decimals rejected
  assert.throws(() => zMoneyEUR.parse('1.234'))
})

test('zPhoneES strips formatting, requires 9-15 digits', () => {
  assert.equal(zPhoneES.parse('+34 612 345 678'), '+34612345678')
  assert.equal(zPhoneES.parse('(91) 555-12-34'), '915551234')
  assert.throws(() => zPhoneES.parse('123'))
  assert.throws(() => zPhoneES.parse('abcdefghi'))
})

test('zSafeText rejects HTML-shaped input', () => {
  const sch = zSafeText(200)
  assert.equal(sch.parse('hola mundo'), 'hola mundo')
  assert.throws(() => sch.parse('<script>x</script>'))
  assert.throws(() => sch.parse('alert &amp; pwn'))
  assert.throws(() => sch.parse('a > b'))
  // Length enforced
  assert.throws(() => zSafeText(5).parse('123456'))
})
