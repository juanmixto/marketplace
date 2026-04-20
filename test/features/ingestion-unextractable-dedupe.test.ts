import test from 'node:test'
import assert from 'node:assert/strict'
import {
  scanUnextractableDedupe,
  type UnextractableExtractionRow,
  type UnextractableScannerDb,
} from '@/domains/ingestion'

function createFakeDb(seed: {
  extractions: UnextractableExtractionRow[]
  reviewItems?: Array<{ kind: string; targetId: string; state: string }>
}) {
  const extractions = new Map(seed.extractions.map((e) => [e.id, { ...e }]))
  const candidates = new Map<string, { id: string; autoApplied: boolean }>()
  const reviewItems = new Map<string, { state: string; autoResolvedReason?: string }>()
  for (const r of seed.reviewItems ?? []) {
    reviewItems.set(`${r.kind}|${r.targetId}`, { state: r.state })
  }
  let idCounter = 0

  const db: UnextractableScannerDb = {
    ingestionExtractionResult: {
      async findUnique({ where }) {
        return extractions.get(where.id) ?? null
      },
      async findMany({ where, take }) {
        const out: UnextractableExtractionRow[] = []
        for (const e of extractions.values()) {
          if (e.id === where.id.not) continue
          if (e.extractorVersion !== where.extractorVersion) continue
          const clsOK = (where.classification?.in ?? []).includes(
            e.classification as 'PRODUCT_NO_PRICE',
          )
          if (!clsOK) continue
          out.push(e)
          if (take && out.length >= take) break
        }
        return out
      },
    },
    ingestionUnextractableDedupeCandidate: {
      async upsert({ where, create }) {
        const key = `${where.leftExtractionId_rightExtractionId_kind.leftExtractionId}|${where.leftExtractionId_rightExtractionId_kind.rightExtractionId}|${where.leftExtractionId_rightExtractionId_kind.kind}`
        const existing = candidates.get(key)
        if (existing) return { id: existing.id, autoApplied: existing.autoApplied }
        const id = `unx-${++idCounter}`
        candidates.set(key, { id, autoApplied: create.autoApplied })
        return { id, autoApplied: create.autoApplied }
      },
      async update({ where, data }) {
        for (const [key, row] of candidates.entries()) {
          if (row.id === where.id) {
            row.autoApplied = data.autoApplied
            candidates.set(key, row)
            return { id: row.id }
          }
        }
        throw new Error('candidate not found')
      },
    },
    ingestionReviewQueueItem: {
      async update({ where, data }) {
        const key = `${where.kind_targetId.kind}|${where.kind_targetId.targetId}`
        const existing = reviewItems.get(key)
        if (!existing) {
          // Create-on-update to keep the fake simple — in real DB
          // this would throw, but we want the test to assert on
          // resulting state regardless of whether the queue item
          // existed from the builder or not.
          reviewItems.set(key, { state: data.state, autoResolvedReason: data.autoResolvedReason })
          return {}
        }
        reviewItems.set(key, { state: data.state, autoResolvedReason: data.autoResolvedReason })
        return {}
      },
    },
    async $transaction(fn) {
      return fn(db)
    },
  }

  return { db, extractions, candidates, reviewItems }
}

function ext(
  overrides: Partial<UnextractableExtractionRow> & { id: string; text: string; author: string | null },
): UnextractableExtractionRow {
  return {
    id: overrides.id,
    extractorVersion: 'rules-1.2.0',
    classification: 'PRODUCT_NO_PRICE',
    inputSnapshot: { text: overrides.text, tgAuthorId: overrides.author },
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('unextractable dedupe: same author + same normalised first line → STRONG LOW auto-merge', async () => {
  const fake = createFakeDb({
    extractions: [
      ext({ id: 'e1', text: '🍯 MIEL ARTESANAL\nApicultura familiar — edición 2026', author: '42' }),
      ext({ id: 'e2', text: '🍯 MIEL ARTESANAL\nPara encargos por privado', author: '42' }),
    ],
    reviewItems: [
      { kind: 'UNEXTRACTABLE_PRODUCT', targetId: 'e2', state: 'ENQUEUED' },
    ],
  })
  const result = await scanUnextractableDedupe(
    { extractionId: 'e2', correlationId: 'cid-1' },
    { db: fake.db, now: () => new Date('2026-04-20T12:00:00Z'), isStageEnabledFn: async () => true },
  )
  assert.equal(result.status, 'OK')
  assert.equal(result.candidatesCreated, 1)
  assert.equal(result.autoMerged, 1)
  assert.equal(result.enqueuedForReview, 0)
  const review = fake.reviewItems.get('UNEXTRACTABLE_PRODUCT|e2')
  assert.equal(review?.state, 'AUTO_RESOLVED')
  assert.match(review?.autoResolvedReason ?? '', /sameAuthorSameNormalisedFirstLine/)
  const cand = [...fake.candidates.values()][0]!
  assert.equal(cand.autoApplied, true)
})

test('unextractable dedupe: different authors + same first line → HEURISTIC MEDIUM, no auto-merge', async () => {
  const fake = createFakeDb({
    extractions: [
      ext({ id: 'e1', text: 'Naranjas Coronat\nde nuestra huerta', author: '10' }),
      ext({ id: 'e2', text: 'Naranjas Coronat\nforwardeado desde otro canal', author: '99' }),
    ],
    reviewItems: [
      { kind: 'UNEXTRACTABLE_PRODUCT', targetId: 'e2', state: 'ENQUEUED' },
    ],
  })
  const result = await scanUnextractableDedupe(
    { extractionId: 'e2', correlationId: 'cid-2' },
    { db: fake.db, now: () => new Date(), isStageEnabledFn: async () => true },
  )
  assert.equal(result.status, 'OK')
  assert.equal(result.candidatesCreated, 1)
  assert.equal(result.autoMerged, 0, 'no auto-merge across authors')
  assert.equal(result.enqueuedForReview, 1)
  const review = fake.reviewItems.get('UNEXTRACTABLE_PRODUCT|e2')
  assert.equal(review?.state, 'ENQUEUED', 'review queue stays ENQUEUED for HEURISTIC')
  const cand = [...fake.candidates.values()][0]!
  assert.equal(cand.autoApplied, false)
})

test('unextractable dedupe: different first line, same author → no candidate', async () => {
  const fake = createFakeDb({
    extractions: [
      ext({ id: 'e1', text: 'Producto A', author: '42' }),
      ext({ id: 'e2', text: 'Producto B', author: '42' }),
    ],
  })
  const result = await scanUnextractableDedupe(
    { extractionId: 'e2', correlationId: 'cid-3' },
    { db: fake.db, now: () => new Date(), isStageEnabledFn: async () => true },
  )
  assert.equal(result.status, 'OK')
  assert.equal(result.candidatesCreated, 0)
})

test('unextractable dedupe: target is not PRODUCT_NO_PRICE → NOT_UNEXTRACTABLE', async () => {
  const fake = createFakeDb({
    extractions: [
      ext({ id: 'e1', text: 'x', author: '1', classification: 'PRODUCT' }),
    ],
  })
  const result = await scanUnextractableDedupe(
    { extractionId: 'e1', correlationId: 'cid-4' },
    { db: fake.db, now: () => new Date(), isStageEnabledFn: async () => true },
  )
  assert.equal(result.status, 'NOT_UNEXTRACTABLE')
  assert.equal(result.candidatesCreated, 0)
})

test('unextractable dedupe: stage flag off → KILLED with zero writes', async () => {
  const fake = createFakeDb({
    extractions: [
      ext({ id: 'e1', text: 'same line', author: '1' }),
      ext({ id: 'e2', text: 'same line', author: '1' }),
    ],
  })
  const result = await scanUnextractableDedupe(
    { extractionId: 'e2', correlationId: 'cid-5' },
    { db: fake.db, now: () => new Date(), isStageEnabledFn: async () => false },
  )
  assert.equal(result.status, 'KILLED')
  assert.equal(fake.candidates.size, 0)
})

test('unextractable dedupe: re-run is idempotent (upsert semantics)', async () => {
  const fake = createFakeDb({
    extractions: [
      ext({ id: 'e1', text: 'same line', author: '1' }),
      ext({ id: 'e2', text: 'same line', author: '1' }),
    ],
    reviewItems: [
      { kind: 'UNEXTRACTABLE_PRODUCT', targetId: 'e2', state: 'ENQUEUED' },
    ],
  })
  const opts = { db: fake.db, now: () => new Date(), isStageEnabledFn: async () => true }
  const a = await scanUnextractableDedupe({ extractionId: 'e2', correlationId: 'cid-6' }, opts)
  const beforeSize = fake.candidates.size
  const b = await scanUnextractableDedupe({ extractionId: 'e2', correlationId: 'cid-6' }, opts)
  assert.equal(a.autoMerged, 1)
  assert.equal(b.candidatesCreated, 1, 'upsert returns existing row, no duplicate')
  assert.equal(b.autoMerged, 0, 'already auto-applied, no second transition')
  assert.equal(fake.candidates.size, beforeSize, 'candidate set unchanged')
})

test('unextractable dedupe: empty text → no candidate (safety guard)', async () => {
  const fake = createFakeDb({
    extractions: [
      ext({ id: 'e1', text: '', author: '1' }),
      ext({ id: 'e2', text: '', author: '1' }),
    ],
  })
  const result = await scanUnextractableDedupe(
    { extractionId: 'e2', correlationId: 'cid-7' },
    { db: fake.db, now: () => new Date(), isStageEnabledFn: async () => true },
  )
  assert.equal(result.status, 'NOT_UNEXTRACTABLE')
})

test('unextractable dedupe: null author on both sides does NOT auto-merge (no stable identity)', async () => {
  const fake = createFakeDb({
    extractions: [
      ext({ id: 'e1', text: 'anonymous catalog line', author: null }),
      ext({ id: 'e2', text: 'anonymous catalog line', author: null }),
    ],
    reviewItems: [
      { kind: 'UNEXTRACTABLE_PRODUCT', targetId: 'e2', state: 'ENQUEUED' },
    ],
  })
  const result = await scanUnextractableDedupe(
    { extractionId: 'e2', correlationId: 'cid-8' },
    { db: fake.db, now: () => new Date(), isStageEnabledFn: async () => true },
  )
  // Null == null should NOT count as "sameAuthor" because a null
  // identity offers zero guarantee it's the same entity.
  assert.equal(result.autoMerged, 0)
  assert.equal(result.enqueuedForReview, 1)
  assert.equal([...fake.candidates.values()][0]!.autoApplied, false)
})
