import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RISK_FOR_KIND,
  classifyProductDedupe,
  normaliseProductName,
  weightBucket,
  type ProductDraftRow,
} from '@/domains/ingestion'

interface FixtureCase {
  id: string
  description: string
  a: ProductDraftRow
  b: ProductDraftRow
  expected: { kind: 'STRONG' | 'HEURISTIC' | 'SIMILARITY'; risk: 'LOW' | 'MEDIUM' | 'HIGH'; reason?: string } | null
}

const cases = JSON.parse(
  readFileSync(
    join(process.cwd(), 'test/fixtures/ingestion-dedupe/cases.json'),
    'utf-8',
  ),
) as FixtureCase[]

for (const fx of cases) {
  test(`dedupe fixture: ${fx.id} — ${fx.description}`, () => {
    const classification = classifyProductDedupe(fx.a, fx.b)
    if (fx.expected === null) {
      assert.equal(classification, null, `expected no match, got ${JSON.stringify(classification)}`)
      return
    }
    assert.ok(classification, `expected classification, got null`)
    assert.equal(classification.kind, fx.expected.kind)
    assert.equal(classification.risk, fx.expected.risk)
    if (fx.expected.reason) {
      assert.equal(classification.reason, fx.expected.reason)
    }
    // Risk class must always match the locked kind→risk map.
    assert.equal(classification.risk, RISK_FOR_KIND[classification.kind])
  })
}

test('dedupe: classification is symmetric — classify(a,b) and classify(b,a) agree on kind', () => {
  // For ordered fields (which draft is "left" vs "right"), the rule
  // outcome must not change — dedupe is a commutative relation.
  for (const fx of cases) {
    if (!fx.expected) continue
    const fwd = classifyProductDedupe(fx.a, fx.b)
    const rev = classifyProductDedupe(fx.b, fx.a)
    assert.ok(fwd && rev, `both directions must produce a result on ${fx.id}`)
    assert.equal(fwd.kind, rev.kind, `kind symmetry broken on ${fx.id}`)
    assert.equal(fwd.risk, rev.risk, `risk symmetry broken on ${fx.id}`)
  }
})

test('dedupe: normaliseProductName strips case, accents, punctuation', () => {
  assert.equal(normaliseProductName('Manzánas GOLDEN!'), 'manzanas golden')
  assert.equal(normaliseProductName('  Hola   '), 'hola')
  assert.equal(normaliseProductName(null), null)
  assert.equal(normaliseProductName(''), null)
  // Emoji-only → null (no letters).
  assert.equal(normaliseProductName('🍅🍅🍅'), null)
})

test('dedupe: weightBucket buckets grams conservatively', () => {
  assert.equal(weightBucket(null), 'none')
  assert.equal(weightBucket(50), '≤100')
  assert.equal(weightBucket(500), '≤500')
  assert.equal(weightBucket(501), '≤1000')
  assert.equal(weightBucket(2000), '≤2500')
  assert.equal(weightBucket(10_000), '>2500')
})

test('dedupe: same id never produces a classification (self-match guard)', () => {
  const row: ProductDraftRow = {
    id: 'same',
    vendorDraftId: 'v1',
    productName: 'Tomates',
    unit: 'KG',
    weightGrams: null,
    priceCents: 180,
    extractorVersion: 'rules-1.0.0',
    canonicalDraftId: null,
  }
  assert.equal(classifyProductDedupe(row, row), null)
})

test('dedupe: LOW is only granted to STRONG matches (contract pin)', () => {
  for (const fx of cases) {
    const classification = classifyProductDedupe(fx.a, fx.b)
    if (!classification) continue
    if (classification.risk === 'LOW') {
      assert.equal(
        classification.kind,
        'STRONG',
        `LOW risk on non-STRONG kind (${classification.kind}) breaks the contract`,
      )
    }
  }
})
