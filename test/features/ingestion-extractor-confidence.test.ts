import test from 'node:test'
import assert from 'node:assert/strict'
import {
  confidenceBandFor,
  extractRules,
} from '@/domains/ingestion'

/**
 * Pins the weighted-confidence contract introduced in rules-1.2.0.
 * These cases are hand-picked to exercise the three invariants the
 * user asked for in iter-2 approval:
 *
 *   1. A clear PRODUCT message with pricePerUnit + unit + name +
 *      availability signal reaches HIGH (>= 0.80) thanks to the
 *      bonus rule.
 *   2. A MEDIUM-shaped message (bare price + name) stays MEDIUM and
 *      does NOT spuriously reach HIGH.
 *   3. A message with an `availDefault` reading does NOT have its
 *      overall confidence dragged down by the 0.3 default — the
 *      weightedConfidence excludes the field entirely.
 */

test('confidence: pricePerUnit + unit + name + availability signal → HIGH', () => {
  const payload = extractRules({
    text: 'Manzanas golden 2,50€/kg. Disponibles hoy.',
  })
  const product = payload.products[0]
  assert.ok(product, 'extractor must emit a product')
  assert.equal(
    confidenceBandFor(product!.confidenceOverall),
    'HIGH',
    `expected HIGH band, got ${product!.confidenceOverall}`,
  )
  assert.ok(
    product!.confidenceModel.bonus !== null,
    'bonus should have fired for pricePerUnit+unit+name',
  )
  assert.equal(product!.confidenceModel.bonus!.amount, 0.05)
})

test('confidence: bare price + name (no per-unit, no availability signal) stays MEDIUM', () => {
  const payload = extractRules({ text: 'KORU Espirulina 60€' })
  const product = payload.products[0]
  assert.ok(product)
  const band = confidenceBandFor(product!.confidenceOverall)
  assert.ok(
    band === 'MEDIUM' || band === 'LOW',
    `expected MEDIUM/LOW, got ${band} (${product!.confidenceOverall})`,
  )
  assert.equal(product!.confidenceModel.bonus, null, 'no bonus expected')
})

test('confidence: availDefault is excluded from the weighted mean (does not hurt overall)', () => {
  // Synthetic text where availability falls back to the default
  // (no "disponible / hoy / fresco / agotado" signal). Still has
  // priceWithPerUnit + unit + name.
  const payload = extractRules({
    text: 'Patatas nuevas 1,20€/kg',
  })
  const product = payload.products[0]
  assert.ok(product)
  assert.ok(
    product!.confidenceModel.excludedFields.includes('availability'),
    'availability must be excluded when rule=availDefault',
  )
  // With availability excluded, this should still reach HIGH thanks
  // to pricePerUnit + unit + name + bonus.
  assert.equal(confidenceBandFor(product!.confidenceOverall), 'HIGH')
})

test('confidence: model weights pin the contract (priceCents + productName = 2, availability = 0.5)', () => {
  const payload = extractRules({
    text: 'Naranjas de la huerta 2,00€/kg. Disponibles.',
  })
  const product = payload.products[0]
  assert.ok(product)
  assert.equal(product!.confidenceModel.weights.priceCents, 2.0)
  assert.equal(product!.confidenceModel.weights.productName, 2.0)
  assert.equal(product!.confidenceModel.weights.availability, 0.5)
  assert.equal(product!.confidenceModel.weights.unit, 1.0)
  assert.equal(product!.confidenceModel.method, 'weightedMean')
})

test('confidence: bare price without a per-unit indicator does NOT trigger the bonus', () => {
  // "60€" is priceBare (no /unit), even with a productName the
  // pipeline should not grant the +0.05 bonus.
  const payload = extractRules({
    text: 'KORU Espirulina 60€',
  })
  const product = payload.products[0]
  assert.ok(product)
  assert.equal(product!.confidenceModel.bonus, null)
})
