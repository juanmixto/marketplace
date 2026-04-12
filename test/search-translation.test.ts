import test from 'node:test'
import assert from 'node:assert/strict'
import { expandSearchQuery } from '@/lib/search-translation'

test('expandSearchQuery returns empty array for empty / whitespace input', () => {
  assert.deepEqual(expandSearchQuery(''), [])
  assert.deepEqual(expandSearchQuery('   '), [])
})

test('expandSearchQuery normalizes case and whitespace', () => {
  const out = expandSearchQuery('  HoNeY  ')
  // Original is normalized; Spanish equivalent is added.
  assert.ok(out.includes('honey'))
  assert.ok(out.includes('miel'))
})

test('expandSearchQuery translates a single English term to Spanish', () => {
  const out = expandSearchQuery('honey')
  assert.deepEqual(out.sort(), ['honey', 'miel'].sort())
})

test('expandSearchQuery translates multi-word English phrases', () => {
  // "olive oil" is a 2-gram entry; the per-word fallbacks also fire.
  const out = expandSearchQuery('olive oil')
  assert.ok(out.includes('olive oil'))
  assert.ok(out.includes('aceite de oliva'))
  assert.ok(out.includes('aceite'))
  assert.ok(out.includes('oliva'))
})

test('expandSearchQuery handles 3-gram phrases (extra virgin olive oil)', () => {
  const out = expandSearchQuery('extra virgin olive oil')
  assert.ok(out.includes('extra virgin olive oil'))
  assert.ok(out.includes('aceite de oliva virgen extra'))
  // It should also pick up shorter sub-phrases.
  assert.ok(out.includes('aceite de oliva'))
  assert.ok(out.includes('virgen extra'))
})

test('expandSearchQuery leaves Spanish queries untouched (no false expansion)', () => {
  const out = expandSearchQuery('miel')
  assert.deepEqual(out, ['miel'])
})

test('expandSearchQuery deduplicates repeated translations', () => {
  // "marmalade" and "jam" both map to "mermelada"; ensure no duplicate.
  const out = expandSearchQuery('jam marmalade')
  const mermeladaCount = out.filter(t => t === 'mermelada').length
  assert.equal(mermeladaCount, 1)
})

test('expandSearchQuery covers main category terms', () => {
  const cases: Array<[string, string]> = [
    ['wine', 'vino'],
    ['cheese', 'queso'],
    ['bread', 'pan'],
    ['vegetables', 'verduras'],
    ['fruits', 'frutas'],
    ['meat', 'carne'],
    ['dairy', 'lácteos'],
  ]
  for (const [en, es] of cases) {
    const out = expandSearchQuery(en)
    assert.ok(out.includes(es), `expected "${en}" → "${es}", got ${JSON.stringify(out)}`)
  }
})

test('expandSearchQuery always includes the original query as a search term', () => {
  // Even untranslatable / brand-name queries should still hit the DB as-is.
  const out = expandSearchQuery('riojano artesano')
  assert.ok(out.includes('riojano artesano'))
})
