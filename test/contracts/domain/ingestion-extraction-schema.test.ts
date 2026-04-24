import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EXTRACTION_SCHEMA_VERSION,
  extractionPayloadSchema,
} from '@/domains/ingestion/processing/extractor/schema'

/**
 * Shape freeze for the extractor payload. Changing this contract is a
 * cross-phase breaking change: Phase 2.5 LLM extraction MUST emit
 * the same shape. Any intentional change bumps
 * `EXTRACTION_SCHEMA_VERSION` AND updates this fixture in the same
 * commit.
 */

test('ExtractionPayload schema version is 2 (frozen, Phase 2.x iter-2)', () => {
  assert.equal(EXTRACTION_SCHEMA_VERSION, 2)
})

const validProduct = {
  productOrdinal: 0,
  productName: 'Manzanas golden',
  categorySlug: 'frutas',
  unit: 'KG',
  weightGrams: null,
  priceCents: 250,
  currencyCode: 'EUR',
  availability: 'AVAILABLE',
  confidenceOverall: 0.85,
  confidenceByField: { priceCents: 0.9, unit: 0.8 },
  extractionMeta: {
    productName: { rule: 'firstLineOpeningWords', source: 'Manzanas golden' },
    priceCents: { rule: 'priceWithPerUnit', source: '2,50€/kg' },
    unit: { rule: 'unitToken', source: 'kg' },
  },
  confidenceModel: {
    method: 'weightedMean',
    weights: { priceCents: 2, productName: 2, unit: 1, availability: 0.5 },
    excludedFields: ['availability'],
    bonus: { rule: 'priceWithPerUnit+unit+name', amount: 0.05 },
  },
}

test('ExtractionPayload parses a well-formed single-product payload (schema v2)', () => {
  const parsed = extractionPayloadSchema.parse({
    schemaVersion: 2,
    products: [validProduct],
    vendorHint: {
      externalId: null,
      displayName: 'Granja El Olmo',
      meta: { rule: 'telegramAuthor', source: 'author:Granja El Olmo' },
    },
    confidenceOverall: 0.85,
    rulesFired: ['priceWithPerUnit', 'unitToken'],
  })
  assert.equal(parsed.products[0]!.productOrdinal, 0)
  assert.equal(parsed.products[0]!.confidenceModel.method, 'weightedMean')
  assert.deepEqual(parsed.products[0]!.confidenceModel.excludedFields, ['availability'])
})

test('ExtractionPayload rejects confidence outside [0,1]', () => {
  assert.throws(() =>
    extractionPayloadSchema.parse({
      schemaVersion: 2,
      products: [],
      vendorHint: { externalId: null, displayName: null, meta: { rule: 'none', source: '' } },
      confidenceOverall: 1.5,
      rulesFired: [],
    }),
  )
})

test('ExtractionPayload rejects unknown units', () => {
  assert.throws(() =>
    extractionPayloadSchema.parse({
      schemaVersion: 2,
      products: [{ ...validProduct, unit: 'LBS' }],
      vendorHint: { externalId: null, displayName: null, meta: { rule: 'none', source: '' } },
      confidenceOverall: 0.1,
      rulesFired: [],
    }),
  )
})

test('ExtractionPayload rejects a product without confidenceModel (schema v2 is strict)', () => {
  const { confidenceModel: _confidenceModel, ...productWithoutModel } = validProduct
  assert.throws(() =>
    extractionPayloadSchema.parse({
      schemaVersion: 2,
      products: [productWithoutModel],
      vendorHint: { externalId: null, displayName: null, meta: { rule: 'none', source: '' } },
      confidenceOverall: 0.5,
      rulesFired: [],
    }),
  )
})

test('ExtractionPayload.confidenceModel.bonus can be null when no bonus fires', () => {
  const parsed = extractionPayloadSchema.parse({
    schemaVersion: 2,
    products: [{ ...validProduct, confidenceModel: { ...validProduct.confidenceModel, bonus: null } }],
    vendorHint: { externalId: null, displayName: null, meta: { rule: 'none', source: '' } },
    confidenceOverall: 0.75,
    rulesFired: [],
  })
  assert.equal(parsed.products[0]!.confidenceModel.bonus, null)
})

test('ExtractionPayload parses empty products array (classifier rejected PRODUCT)', () => {
  const parsed = extractionPayloadSchema.parse({
    schemaVersion: 2,
    products: [],
    vendorHint: { externalId: null, displayName: null, meta: { rule: 'none', source: '' } },
    confidenceOverall: 0,
    rulesFired: [],
  })
  assert.equal(parsed.products.length, 0)
})
