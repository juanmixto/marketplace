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

test('ExtractionPayload schema version is 1 (frozen)', () => {
  assert.equal(EXTRACTION_SCHEMA_VERSION, 1)
})

test('ExtractionPayload parses a well-formed single-product payload', () => {
  const parsed = extractionPayloadSchema.parse({
    schemaVersion: 1,
    products: [
      {
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
          productName: { rule: 'firstSegmentBeforePrice', source: 'Manzanas golden' },
          priceCents: { rule: 'priceEurPerKg', source: '2,50€/kg' },
          unit: { rule: 'unitToken', source: 'kg' },
        },
      },
    ],
    vendorHint: {
      externalId: null,
      displayName: 'Granja El Olmo',
      meta: { rule: 'telegramAuthor', source: 'author:Granja El Olmo' },
    },
    confidenceOverall: 0.85,
    rulesFired: ['priceEurPerKg', 'unitToken', 'telegramAuthor'],
  })
  assert.equal(parsed.products[0]!.productOrdinal, 0)
  assert.equal(parsed.vendorHint.displayName, 'Granja El Olmo')
})

test('ExtractionPayload rejects confidence outside [0,1]', () => {
  assert.throws(() =>
    extractionPayloadSchema.parse({
      schemaVersion: 1,
      products: [],
      vendorHint: {
        externalId: null,
        displayName: null,
        meta: { rule: 'none', source: '' },
      },
      confidenceOverall: 1.5,
      rulesFired: [],
    }),
  )
})

test('ExtractionPayload rejects unknown units', () => {
  assert.throws(() =>
    extractionPayloadSchema.parse({
      schemaVersion: 1,
      products: [
        {
          productOrdinal: 0,
          productName: null,
          categorySlug: null,
          unit: 'LBS', // not in the closed enum
          weightGrams: null,
          priceCents: null,
          currencyCode: null,
          availability: 'UNKNOWN',
          confidenceOverall: 0.1,
          confidenceByField: {},
          extractionMeta: {},
        },
      ],
      vendorHint: {
        externalId: null,
        displayName: null,
        meta: { rule: 'none', source: '' },
      },
      confidenceOverall: 0.1,
      rulesFired: [],
    }),
  )
})

test('ExtractionPayload parses empty products array (classifier rejected PRODUCT)', () => {
  const parsed = extractionPayloadSchema.parse({
    schemaVersion: 1,
    products: [],
    vendorHint: {
      externalId: null,
      displayName: null,
      meta: { rule: 'none', source: '' },
    },
    confidenceOverall: 0,
    rulesFired: [],
  })
  assert.equal(parsed.products.length, 0)
})
