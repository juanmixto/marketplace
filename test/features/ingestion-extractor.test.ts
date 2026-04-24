import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  extractRules,
  extractionPayloadSchema,
} from '@/domains/ingestion/processing/extractor'
import { classifyMessage } from '@/domains/ingestion/processing/classifier'

interface FixtureCase {
  id: string
  description: string
  text: string
  expectedClassifier: { kind: string }
  expectedProducts?: number
  expectedOrdinals?: number[]
  expectedPrices?: number[]
  expectedFirstProduct?: {
    productName?: string
    priceCents?: number
    currencyCode?: string
    unit?: string
    availability?: string
  }
}

const cases = JSON.parse(
  readFileSync(
    join(process.cwd(), 'test/fixtures/ingestion-messages/cases.json'),
    'utf-8',
  ),
) as FixtureCase[]

const productCases = cases.filter((c) => c.expectedClassifier.kind === 'PRODUCT')

for (const fx of productCases) {
  test(`extractor fixture: ${fx.id} — ${fx.description}`, () => {
    const payload = extractRules({ text: fx.text })
    // Payload shape must stay frozen.
    extractionPayloadSchema.parse(payload)

    if (fx.expectedProducts !== undefined) {
      assert.equal(
        payload.products.length,
        fx.expectedProducts,
        `expected ${fx.expectedProducts} products, got ${payload.products.length}`,
      )
    }

    if (fx.expectedOrdinals) {
      assert.deepEqual(
        payload.products.map((p) => p.productOrdinal),
        fx.expectedOrdinals,
      )
    }

    if (fx.expectedPrices) {
      assert.deepEqual(
        payload.products.map((p) => p.priceCents),
        fx.expectedPrices,
      )
    }

    const first = payload.products[0]
    if (fx.expectedFirstProduct && first) {
      for (const [k, v] of Object.entries(fx.expectedFirstProduct)) {
        const actual = (first as unknown as Record<string, unknown>)[k]
        assert.equal(
          actual,
          v,
          `${fx.id}.expectedFirstProduct.${k}: expected ${v}, got ${actual}`,
        )
      }
    }
  })
}

test('extractor: deterministic — same input gives identical payload', () => {
  const text = 'Manzanas golden: 2,50€/kg. Disponibles hoy.'
  const a = extractRules({ text })
  const b = extractRules({ text })
  assert.deepEqual(a, b)
})

test('extractor: every extracted field carries a rule + source in extractionMeta', () => {
  const payload = extractRules({ text: 'Manzanas golden 2,50€/kg' })
  const product = payload.products[0]
  assert.ok(product, 'extractor must emit at least one product')
  assert.ok(product.extractionMeta.priceCents, 'priceCents must have meta')
  assert.ok(product.extractionMeta.priceCents!.rule.length > 0)
  assert.ok(product.extractionMeta.priceCents!.source.length > 0)
})

test('extractor: multi-product message keeps ordinals distinct and independent', () => {
  const text = '• Tomates 1,80€/kg\n• Lechuga 0,90€/ud'
  const payload = extractRules({ text })
  assert.equal(payload.products.length, 2)
  assert.equal(payload.products[0]!.priceCents, 180)
  assert.equal(payload.products[1]!.priceCents, 90)
  // Attributes must not bleed across products: unit on the first
  // must not leak onto the second.
  assert.equal(payload.products[0]!.unit, 'KG')
  assert.equal(payload.products[1]!.unit, 'UNIT')
})

test('extractor: when classifier rejects PRODUCT, extractor is not called (orchestration invariant)', () => {
  // This is an architectural reminder pinned as a test: the pipeline
  // must skip the extractor on non-PRODUCT classifications. The
  // extractor itself tolerates being called, but produces 0 products
  // on a greeting — pinned here so a regression in extractor rules
  // never silently materialises drafts for conversation messages.
  const greeting = 'Hola buenas, ¿alguien sabe si queda algo para el sábado?'
  assert.equal(classifyMessage({ text: greeting }).kind, 'CONVERSATION')
  const payload = extractRules({ text: greeting })
  assert.equal(payload.products.length, 0)
})

test('extractor: confidence stays in [0,1]', () => {
  for (const fx of productCases) {
    const payload = extractRules({ text: fx.text })
    assert.ok(payload.confidenceOverall >= 0 && payload.confidenceOverall <= 1)
    for (const p of payload.products) {
      assert.ok(p.confidenceOverall >= 0 && p.confidenceOverall <= 1)
    }
  }
})
