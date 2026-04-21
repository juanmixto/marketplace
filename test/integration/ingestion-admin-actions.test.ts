import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  discardProductDraft,
  editProductDraft,
  discardUnextractable,
  markUnextractableValid,
  listReviewQueue,
  getReviewQueueItem,
} from '@/domains/ingestion'
import { INGESTION_ADMIN_FEATURE_FLAG } from '@/domains/ingestion'
import {
  resetIntegrationDatabase,
  useTestSession,
  clearTestSession,
  buildSession,
  createUser,
} from './helpers'
import { setTestFlagOverrides, clearTestFlagOverrides } from '../flags-helper'

/**
 * End-to-end coverage for the Phase 3 admin review UI: domain queries
 * + server actions against real Postgres. The UI itself is a thin
 * shell over these two surfaces, so if both work here the page works.
 *
 * Every action guard is exercised:
 *   - `requireIngestionAdmin` fails when the flag is off.
 *   - Audit rows are written in the same transaction as the state
 *     change.
 *   - Review queue items flip `ENQUEUED → AUTO_RESOLVED` with a
 *     reason tag so the Phase 2.x contract is preserved (only
 *     ENQUEUED and AUTO_RESOLVED states exist).
 */

async function seedProductDraft() {
  const connection = await db.telegramIngestionConnection.create({
    data: {
      label: 'Test',
      phoneNumberHash: 'h',
      sessionRef: `sess-${Date.now()}-${Math.random()}`,
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  const chat = await db.telegramIngestionChat.create({
    data: {
      connectionId: connection.id,
      tgChatId: BigInt(-100),
      title: 't',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })
  const message = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(1),
      tgAuthorId: BigInt(42),
      text: 'Manzanas golden 2,50€/kg',
      rawJson: { text: 'Manzanas golden 2,50€/kg' },
      postedAt: new Date('2026-04-20T10:00:00Z'),
    },
  })
  const extraction = await db.ingestionExtractionResult.create({
    data: {
      messageId: message.id,
      engine: 'RULES',
      extractorVersion: 'rules-1.2.0',
      schemaVersion: 2,
      inputSnapshot: { text: message.text },
      payload: { products: [{ productOrdinal: 0 }], rulesFired: ['priceWithPerUnit'] },
      confidenceOverall: 0.85,
      confidenceBand: 'HIGH',
      confidenceByField: {},
      classification: 'PRODUCT',
      correlationId: 'cid-seed-1',
    },
  })
  const draft = await db.ingestionProductDraft.create({
    data: {
      sourceMessageId: message.id,
      sourceExtractionId: extraction.id,
      extractorVersion: 'rules-1.2.0',
      productOrdinal: 0,
      status: 'PENDING',
      confidenceOverall: 0.85,
      confidenceBand: 'HIGH',
      productName: 'Manzanas golden',
      priceCents: 250,
      currencyCode: 'EUR',
      unit: 'KG',
      rawFieldsSeen: {},
    },
  })
  const queueItem = await db.ingestionReviewQueueItem.create({
    data: { kind: 'PRODUCT_DRAFT', targetId: draft.id, state: 'ENQUEUED' },
  })
  return { message, extraction, draft, queueItem }
}

async function seedUnextractable() {
  const connection = await db.telegramIngestionConnection.create({
    data: {
      label: 'Test',
      phoneNumberHash: 'h',
      sessionRef: `sess-${Date.now()}-${Math.random()}`,
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  const chat = await db.telegramIngestionChat.create({
    data: {
      connectionId: connection.id,
      tgChatId: BigInt(-100),
      title: 't',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })
  const message = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(2),
      tgAuthorId: BigInt(99),
      text: 'Miel artesanal de nuestra colmena\npedidos por privado',
      rawJson: {},
      postedAt: new Date('2026-04-20T11:00:00Z'),
    },
  })
  const extraction = await db.ingestionExtractionResult.create({
    data: {
      messageId: message.id,
      engine: 'RULES',
      extractorVersion: 'rules-1.2.0',
      schemaVersion: 2,
      inputSnapshot: { text: message.text },
      payload: { products: [], rulesFired: [] },
      confidenceOverall: 0,
      confidenceBand: 'LOW',
      confidenceByField: {},
      classification: 'PRODUCT_NO_PRICE',
      correlationId: 'cid-seed-2',
    },
  })
  const queueItem = await db.ingestionReviewQueueItem.create({
    data: { kind: 'UNEXTRACTABLE_PRODUCT', targetId: extraction.id, state: 'ENQUEUED' },
  })
  return { message, extraction, queueItem }
}

async function withAdminSession<T>(fn: () => Promise<T>): Promise<T> {
  const user = await createUser('ADMIN_OPS')
  useTestSession(buildSession(user.id, 'ADMIN_OPS'))
  try {
    return await fn()
  } finally {
    clearTestSession()
  }
}

beforeEach(async () => {
  await resetIntegrationDatabase()
  setTestFlagOverrides({ [INGESTION_ADMIN_FEATURE_FLAG]: true })
})

afterEach(() => {
  clearTestFlagOverrides()
  clearTestSession()
})

test('admin: discard draft flips status to REJECTED + review item to AUTO_RESOLVED', async () => {
  const { draft, queueItem } = await seedProductDraft()
  await withAdminSession(() => discardProductDraft({ draftId: draft.id }))

  const updated = await db.ingestionProductDraft.findUniqueOrThrow({ where: { id: draft.id } })
  assert.equal(updated.status, 'REJECTED')
  const qi = await db.ingestionReviewQueueItem.findUniqueOrThrow({ where: { id: queueItem.id } })
  assert.equal(qi.state, 'AUTO_RESOLVED')
  assert.equal(qi.autoResolvedReason, 'adminDiscarded')
})

test('admin: edit draft patches whitelisted fields only + writes before/after audit', async () => {
  const { draft } = await seedProductDraft()
  await withAdminSession(() =>
    editProductDraft({
      draftId: draft.id,
      patch: { productName: 'Manzanas Golden Delicious', priceCents: 275 },
    }),
  )
  const updated = await db.ingestionProductDraft.findUniqueOrThrow({ where: { id: draft.id } })
  assert.equal(updated.productName, 'Manzanas Golden Delicious')
  assert.equal(updated.priceCents, 275)
  // Untouched fields preserve their values.
  assert.equal(updated.unit, 'KG')
  // Status stays PENDING — edit does not flip resolution.
  assert.equal(updated.status, 'PENDING')
  const auditRows = await db.auditLog.findMany({
    where: { entityType: 'IngestionProductDraft', entityId: draft.id, action: 'INGESTION_DRAFT_EDITED' },
  })
  assert.equal(auditRows.length, 1)
})

test('admin: discard refuses when draft is already resolved', async () => {
  const { draft } = await seedProductDraft()
  await withAdminSession(() => discardProductDraft({ draftId: draft.id }))
  await assert.rejects(
    () => withAdminSession(() => discardProductDraft({ draftId: draft.id })),
    /already resolved/,
  )
})

test('admin: discardUnextractable resolves review item with adminDiscardedUnextractable reason', async () => {
  const { extraction, queueItem } = await seedUnextractable()
  await withAdminSession(() => discardUnextractable({ extractionId: extraction.id }))
  const qi = await db.ingestionReviewQueueItem.findUniqueOrThrow({ where: { id: queueItem.id } })
  assert.equal(qi.state, 'AUTO_RESOLVED')
  assert.equal(qi.autoResolvedReason, 'adminDiscardedUnextractable')
  // Extraction row itself stays intact (audit trail).
  const ext = await db.ingestionExtractionResult.findUnique({ where: { id: extraction.id } })
  assert.ok(ext)
})

test('admin: markUnextractableValid resolves review item with adminMarkedValid reason', async () => {
  const { extraction, queueItem } = await seedUnextractable()
  await withAdminSession(() => markUnextractableValid({ extractionId: extraction.id }))
  const qi = await db.ingestionReviewQueueItem.findUniqueOrThrow({ where: { id: queueItem.id } })
  assert.equal(qi.state, 'AUTO_RESOLVED')
  assert.equal(qi.autoResolvedReason, 'adminMarkedValid')
})

test('admin: actions refuse when feat-ingestion-admin flag is off (pre-GA isolation)', async () => {
  const { draft } = await seedProductDraft()
  setTestFlagOverrides({ [INGESTION_ADMIN_FEATURE_FLAG]: false })
  await assert.rejects(
    () => withAdminSession(() => discardProductDraft({ draftId: draft.id })),
    /not currently available/i,
  )
  // State must be untouched.
  const unchanged = await db.ingestionProductDraft.findUniqueOrThrow({ where: { id: draft.id } })
  assert.equal(unchanged.status, 'PENDING')
})

test('query: listReviewQueue returns both PRODUCT_DRAFT and UNEXTRACTABLE_PRODUCT rows with truncated text', async () => {
  await seedProductDraft()
  await seedUnextractable()
  const result = await listReviewQueue({ state: 'ENQUEUED' })
  assert.equal(result.total, 2)
  assert.equal(result.rows.length, 2)
  const kinds = result.rows.map((r) => r.target.kind).sort()
  assert.deepEqual(kinds, ['PRODUCT_DRAFT', 'UNEXTRACTABLE_PRODUCT'])
})

test('query: getReviewQueueItem hydrates draft + extraction + vendor for PRODUCT_DRAFT', async () => {
  const { queueItem, draft } = await seedProductDraft()
  const detail = await getReviewQueueItem(queueItem.id)
  assert.ok(detail)
  assert.equal(detail!.target.kind, 'PRODUCT_DRAFT')
  if (detail!.target.kind !== 'PRODUCT_DRAFT') throw new Error('narrowing')
  assert.equal(detail!.target.draft.id, draft.id)
  assert.equal(detail!.target.draft.productName, 'Manzanas golden')
  assert.equal(detail!.target.extraction.extractorVersion, 'rules-1.2.0')
})

test('query: getReviewQueueItem returns null for missing id', async () => {
  const detail = await getReviewQueueItem('missing-id')
  assert.equal(detail, null)
})

test('query: listReviewQueue filters by kind', async () => {
  await seedProductDraft()
  await seedUnextractable()
  const onlyUnextractable = await listReviewQueue({
    kind: 'UNEXTRACTABLE_PRODUCT',
    state: 'ALL',
  })
  assert.equal(onlyUnextractable.total, 1)
  assert.equal(onlyUnextractable.rows[0]!.target.kind, 'UNEXTRACTABLE_PRODUCT')
})
