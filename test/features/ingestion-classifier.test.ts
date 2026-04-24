import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyMessage } from '@/domains/ingestion/processing/classifier'

/**
 * Frozen fixtures pin the classifier's behaviour on real-shape
 * messages. Do not mutate existing cases to make the tests pass;
 * if behaviour needs to change, add a new fixture and bump
 * `CURRENT_RULES_EXTRACTOR_VERSION` (rules-1.0.x → rules-1.1.0).
 */

interface FixtureCase {
  id: string
  description: string
  text: string
  expectedClassifier: {
    kind: 'PRODUCT' | 'CONVERSATION' | 'SPAM' | 'OTHER'
    confidenceAtLeast?: number
  }
}

const fixturePath = join(
  process.cwd(),
  'test/fixtures/ingestion-messages/cases.json',
)
const cases = JSON.parse(readFileSync(fixturePath, 'utf-8')) as FixtureCase[]

for (const fx of cases) {
  test(`classifier fixture: ${fx.id} — ${fx.description}`, () => {
    const result = classifyMessage({ text: fx.text })
    assert.equal(
      result.kind,
      fx.expectedClassifier.kind,
      `expected ${fx.expectedClassifier.kind} got ${result.kind}; signals=${JSON.stringify(result.signals)}`,
    )
    if (fx.expectedClassifier.confidenceAtLeast !== undefined) {
      assert.ok(
        result.confidence >= fx.expectedClassifier.confidenceAtLeast,
        `confidence ${result.confidence} < ${fx.expectedClassifier.confidenceAtLeast}`,
      )
    }
  })
}

test('classifier is deterministic: same input → same output', () => {
  const text = 'Manzanas golden: 2,50€/kg. Disponibles hoy.'
  const a = classifyMessage({ text })
  const b = classifyMessage({ text })
  assert.deepEqual(a, b)
})

test('classifier signals are explainable (rule name + weight > 0) when kind is not OTHER', () => {
  const result = classifyMessage({ text: 'Manzanas golden 2,50€/kg' })
  assert.equal(result.kind, 'PRODUCT')
  for (const signal of result.signals) {
    assert.ok(signal.rule.length > 0, 'signal must carry a rule name')
    assert.ok(signal.weight > 0, 'PRODUCT signals must have positive weight')
  }
})

test('classifier favours false negatives: single produce word is OTHER not PRODUCT', () => {
  assert.equal(classifyMessage({ text: 'Manzanas' }).kind, 'OTHER')
  assert.equal(classifyMessage({ text: 'Patatas' }).kind, 'OTHER')
})
