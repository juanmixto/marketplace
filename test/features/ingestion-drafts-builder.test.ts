import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDrafts,
  type BuildDraftsInput,
  type DraftsBuilderDb,
} from '@/domains/ingestion'

/**
 * In-memory DraftsBuilderDb: no DB, no Prisma, just a shape-compatible
 * fake that honours the uniqueness constraints the real tables do.
 * Integration against real Postgres lives in
 * `test/integration/ingestion-processing-trace.test.ts`.
 */

function createFakeDb() {
  const extractions = new Map<string, { id: string; key: string }>()
  const vendors = new Map<string, { id: string; key: string }>()
  const products = new Map<string, { id: string; ordinal: number; key: string }>()
  const reviewItems = new Map<string, { id: string }>()
  let idSeq = 0
  const id = (prefix: string) => `${prefix}_${++idSeq}`

  const db: DraftsBuilderDb = {
    ingestionExtractionResult: {
      async upsert({ where, create }) {
        const key = `${where.messageId_extractorVersion.messageId}|${where.messageId_extractorVersion.extractorVersion}`
        const existing = extractions.get(key)
        if (existing) return { id: existing.id }
        const row = { id: id('ex'), key }
        extractions.set(key, row)
        void create
        return { id: row.id }
      },
    },
    ingestionVendorDraft: {
      async upsert({ where, create }) {
        const key = `${where.externalId_extractorVersion.externalId}|${where.externalId_extractorVersion.extractorVersion}`
        const existing = vendors.get(key)
        if (existing) return { id: existing.id }
        const row = { id: id('vd'), key }
        vendors.set(key, row)
        void create
        return { id: row.id }
      },
      async create({ data }) {
        const row = { id: id('vd-anon'), key: `anon:${data.displayName}:${idSeq}` }
        vendors.set(row.key, row)
        return { id: row.id }
      },
    },
    ingestionProductDraft: {
      async upsert({ where, create }) {
        const key = `${where.sourceMessageId_extractorVersion_productOrdinal.sourceMessageId}|${where.sourceMessageId_extractorVersion_productOrdinal.extractorVersion}|${where.sourceMessageId_extractorVersion_productOrdinal.productOrdinal}`
        const existing = products.get(key)
        if (existing) return { id: existing.id, productOrdinal: existing.ordinal }
        const row = {
          id: id('pd'),
          ordinal: where.sourceMessageId_extractorVersion_productOrdinal.productOrdinal,
          key,
        }
        products.set(key, row)
        void create
        return { id: row.id, productOrdinal: row.ordinal }
      },
    },
    ingestionReviewQueueItem: {
      async upsert({ where }) {
        const key = `${where.kind_targetId.kind}|${where.kind_targetId.targetId}`
        const existing = reviewItems.get(key)
        if (existing) return { id: existing.id }
        const row = { id: id('rq') }
        reviewItems.set(key, row)
        return { id: row.id }
      },
    },
    async $transaction(fn) {
      return fn(db)
    },
  }
  return { db, extractions, vendors, products, reviewItems }
}

function baseInput(overrides: Partial<BuildDraftsInput> = {}): BuildDraftsInput {
  return {
    messageId: 'msg-1',
    extractorVersion: 'rules-1.0.0',
    classification: {
      kind: 'PRODUCT',
      confidence: 0.85,
      confidenceBand: 'HIGH',
      signals: [{ rule: 'pricePerUnitToken', weight: 0.65, match: '2,50€/kg' }],
    },
    extraction: {
      schemaVersion: 2,
      products: [
        {
          productOrdinal: 0,
          productName: 'Manzanas golden',
          categorySlug: null,
          unit: 'KG',
          weightGrams: null,
          priceCents: 250,
          currencyCode: 'EUR',
          availability: 'AVAILABLE',
          confidenceOverall: 0.85,
          confidenceByField: { priceCents: 0.9, unit: 0.8 },
          extractionMeta: {
            priceCents: { rule: 'priceWithPerUnit', source: '2,50€/kg' },
            unit: { rule: 'unitToken', source: 'kg' },
          },
          confidenceModel: { method: 'weightedMean', weights: {}, excludedFields: [], bonus: null },
        },
      ],
      vendorHint: {
        externalId: 'vendor-123',
        displayName: 'Granja Test',
        meta: { rule: 'telegramAuthorExternalId', source: 'author:vendor-123' },
      },
      confidenceOverall: 0.85,
      rulesFired: ['priceWithPerUnit', 'unitToken', 'telegramAuthorExternalId'],
    },
    inputSnapshot: { text: 'Manzanas golden: 2,50€/kg.' },
    correlationId: 'cid-1',
    ...overrides,
  }
}

test('buildDrafts: happy path writes extraction + vendor + product + review queue', async () => {
  const fake = createFakeDb()
  const result = await buildDrafts(baseInput(), {
    db: fake.db,
    isKilled: async () => false,
  })
  assert.equal(result.status, 'OK')
  assert.ok(result.extractionResultId)
  assert.ok(result.vendorDraftId)
  assert.equal(result.productDraftIds.length, 1)
  assert.equal(result.reviewItemsEnqueued, 1)
})

test('buildDrafts: kill switch returns KILLED before any DB write', async () => {
  const fake = createFakeDb()
  const result = await buildDrafts(baseInput(), {
    db: fake.db,
    isKilled: async () => true,
  })
  assert.equal(result.status, 'KILLED')
  assert.equal(fake.extractions.size, 0)
  assert.equal(fake.products.size, 0)
  assert.equal(fake.vendors.size, 0)
  assert.equal(fake.reviewItems.size, 0)
})

test('buildDrafts: re-run at same extractor version is idempotent', async () => {
  const fake = createFakeDb()
  const r1 = await buildDrafts(baseInput(), { db: fake.db, isKilled: async () => false })
  const r2 = await buildDrafts(baseInput(), { db: fake.db, isKilled: async () => false })
  assert.equal(r1.status, 'OK')
  assert.equal(r2.status, 'OK')
  // Same extraction id and same product draft ids on re-run.
  assert.equal(r1.extractionResultId, r2.extractionResultId)
  assert.deepEqual(r1.productDraftIds, r2.productDraftIds)
  assert.equal(fake.products.size, 1)
  assert.equal(fake.reviewItems.size, 1)
})

test('buildDrafts: multi-product message persists one draft per ordinal, no cross-mix', async () => {
  const fake = createFakeDb()
  const input = baseInput({
    extraction: {
      schemaVersion: 2,
      products: [
        {
          productOrdinal: 0,
          productName: 'Tomates',
          categorySlug: null,
          unit: 'KG',
          weightGrams: null,
          priceCents: 180,
          currencyCode: 'EUR',
          availability: 'UNKNOWN',
          confidenceOverall: 0.7,
          confidenceByField: {},
          extractionMeta: {},
          confidenceModel: { method: 'weightedMean', weights: {}, excludedFields: [], bonus: null },
        },
        {
          productOrdinal: 1,
          productName: 'Lechuga',
          categorySlug: null,
          unit: 'UNIT',
          weightGrams: null,
          priceCents: 90,
          currencyCode: 'EUR',
          availability: 'UNKNOWN',
          confidenceOverall: 0.65,
          confidenceByField: {},
          extractionMeta: {},
          confidenceModel: { method: 'weightedMean', weights: {}, excludedFields: [], bonus: null },
        },
      ],
      vendorHint: {
        externalId: 'author-42',
        displayName: 'Hortaliza',
        meta: { rule: 'telegramAuthorExternalId', source: 'author:author-42' },
      },
      confidenceOverall: 0.68,
      rulesFired: [],
    },
  })
  const result = await buildDrafts(input, { db: fake.db, isKilled: async () => false })
  assert.equal(result.status, 'OK')
  assert.equal(result.productDraftIds.length, 2)
  assert.equal(fake.products.size, 2)
  assert.equal(fake.reviewItems.size, 2)
})

test('buildDrafts: non-PRODUCT classification keeps audit trail but creates no drafts', async () => {
  const fake = createFakeDb()
  const input = baseInput({
    classification: {
      kind: 'CONVERSATION',
      confidence: 0.6,
      confidenceBand: 'MEDIUM',
      signals: [],
    },
  })
  const result = await buildDrafts(input, { db: fake.db, isKilled: async () => false })
  assert.equal(result.status, 'SKIPPED_NON_PRODUCT')
  assert.ok(result.extractionResultId, 'audit row still created')
  assert.equal(result.productDraftIds.length, 0)
  assert.equal(fake.products.size, 0)
  assert.equal(fake.vendors.size, 0)
  assert.equal(fake.reviewItems.size, 0)
})

test('buildDrafts: PRODUCT with zero extracted products returns UNEXTRACTABLE + enqueues review item (rules-1.1.0)', async () => {
  const fake = createFakeDb()
  const input = baseInput({
    extraction: {
      schemaVersion: 2,
      products: [],
      vendorHint: {
        externalId: null,
        displayName: null,
        meta: { rule: 'vendorUnknown', source: '' },
      },
      confidenceOverall: 0,
      rulesFired: [],
    },
  })
  const result = await buildDrafts(input, { db: fake.db, isKilled: async () => false })
  assert.equal(result.status, 'UNEXTRACTABLE')
  assert.ok(result.extractionResultId)
  assert.equal(fake.products.size, 0)
  assert.equal(result.reviewItemsEnqueued, 1)
  // The review row must target the extraction id (not a draft) and
  // be of kind UNEXTRACTABLE_PRODUCT so the future admin UI can
  // distinguish it from reviewable drafts.
  assert.ok(
    [...fake.reviewItems.keys()].some(
      (k) => k.startsWith('UNEXTRACTABLE_PRODUCT|') && k.endsWith(result.extractionResultId!),
    ),
    'expected UNEXTRACTABLE_PRODUCT review queue item targeting the extraction',
  )
})

test('buildDrafts: classifier=PRODUCT_NO_PRICE also takes the UNEXTRACTABLE path (no drafts)', async () => {
  const fake = createFakeDb()
  const input = baseInput({
    classification: {
      kind: 'PRODUCT_NO_PRICE',
      confidence: 0.5,
      confidenceBand: 'MEDIUM',
      signals: [],
    },
    extraction: {
      schemaVersion: 2,
      products: [],
      vendorHint: {
        externalId: null,
        displayName: null,
        meta: { rule: 'classifiedProductNoPrice', source: 'PRODUCT_NO_PRICE' },
      },
      confidenceOverall: 0,
      rulesFired: [],
    },
  })
  const result = await buildDrafts(input, { db: fake.db, isKilled: async () => false })
  assert.equal(result.status, 'UNEXTRACTABLE')
  assert.equal(fake.products.size, 0)
  assert.equal(result.reviewItemsEnqueued, 1)
})

test('buildDrafts: vendor with null externalId always creates a fresh vendor draft (no auto-merge)', async () => {
  const fake = createFakeDb()
  const input = baseInput({
    extraction: {
      schemaVersion: 2,
      products: [
        {
          productOrdinal: 0,
          productName: 'X',
          categorySlug: null,
          unit: null,
          weightGrams: null,
          priceCents: 500,
          currencyCode: 'EUR',
          availability: 'UNKNOWN',
          confidenceOverall: 0.5,
          confidenceByField: {},
          extractionMeta: {},
          confidenceModel: { method: 'weightedMean', weights: {}, excludedFields: [], bonus: null },
        },
      ],
      vendorHint: {
        externalId: null,
        displayName: 'Unknown post',
        meta: { rule: 'vendorUnknown', source: '' },
      },
      confidenceOverall: 0.5,
      rulesFired: [],
    },
  })
  await buildDrafts(input, { db: fake.db, isKilled: async () => false })
  await buildDrafts({ ...input, messageId: 'msg-2' }, {
    db: fake.db,
    isKilled: async () => false,
  })
  // Two messages with unknown author → TWO vendor drafts, never
  // auto-merged.
  assert.equal(fake.vendors.size, 2)
})
