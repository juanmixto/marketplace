import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import {
  INGESTION_ADMIN_FEATURE_FLAG,
  INGESTION_PUBLISH_FEATURE_FLAG,
  publishApprovedDraft,
} from '@/domains/ingestion'
import { IngestionPublishValidationError } from '@/domains/ingestion/processing/admin/errors'
import {
  buildSession,
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'
import { clearTestFlagOverrides, setTestFlagOverrides } from '../flags-helper'

/**
 * Phase 4 PR-B publish action end-to-end against real Postgres.
 *
 * The action is the only path that turns an approved draft into a
 * real `Product` + ghost `Vendor` row. Invariants covered:
 *
 *   - Happy path: PENDING → PENDING_REVIEW catalog row, deterministic
 *     ghost User + Vendor created, draft flipped APPROVED, review
 *     queue resolved with `adminApproved`, single audit row with
 *     full trace.
 *   - Idempotency: approving the same draft twice returns the same
 *     Product id and does NOT create a second ghost user.
 *   - Same producer across two drafts: one User + one Vendor, two
 *     distinct Products.
 *   - Hard validations: missing tgAuthorId, priceCents null or ≤ 0,
 *     empty productName after sanitisation, non-EUR currency, and
 *     already-resolved draft all raise `IngestionPublishValidationError`
 *     without side effects.
 *   - Category fallback: unknown slug maps to cat_uncategorized.
 *   - Flag gating: publish is blocked when `feat-ingestion-publish`
 *     is off, even when `feat-ingestion-admin` is on.
 */

interface SeedOpts {
  tgAuthorId?: string | null
  productName?: string | null
  priceCents?: number | null
  currencyCode?: string | null
  unit?: string | null
  weightGrams?: number | null
  categorySlug?: string | null
  availability?: string | null
  draftStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'TOMBSTONED'
}

async function seedProductDraft(opts: SeedOpts = {}) {
  const connection = await db.telegramIngestionConnection.create({
    data: {
      label: `Test ${randomUUID().slice(0, 8)}`,
      phoneNumberHash: 'h',
      sessionRef: `sess-${randomUUID()}`,
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  const chat = await db.telegramIngestionChat.create({
    data: {
      connectionId: connection.id,
      tgChatId: BigInt(-100) - BigInt(Math.floor(Math.random() * 1_000_000)),
      title: 't',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })
  const tgAuthorId = opts.tgAuthorId === undefined ? '424242' : opts.tgAuthorId
  const message = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(Math.floor(Math.random() * 1_000_000_000)),
      tgAuthorId: tgAuthorId == null ? null : BigInt(tgAuthorId),
      text: 'seed text',
      rawJson: {},
      postedAt: new Date(),
    },
  })
  const extraction = await db.ingestionExtractionResult.create({
    data: {
      messageId: message.id,
      engine: 'RULES',
      extractorVersion: 'rules-1.2.0',
      schemaVersion: 2,
      inputSnapshot: { text: 'seed text' },
      payload: { products: [{ productOrdinal: 0 }], rulesFired: [] },
      confidenceOverall: 0.85,
      confidenceBand: 'HIGH',
      confidenceByField: {},
      classification: 'PRODUCT',
      correlationId: `cid-${randomUUID()}`,
    },
  })
  const draft = await db.ingestionProductDraft.create({
    data: {
      sourceMessageId: message.id,
      sourceExtractionId: extraction.id,
      extractorVersion: 'rules-1.2.0',
      productOrdinal: 0,
      status: opts.draftStatus ?? 'PENDING',
      confidenceOverall: 0.85,
      confidenceBand: 'HIGH',
      productName:
        opts.productName === undefined ? 'Manzanas golden' : opts.productName,
      priceCents: opts.priceCents === undefined ? 250 : opts.priceCents,
      currencyCode:
        opts.currencyCode === undefined ? 'EUR' : opts.currencyCode,
      unit: opts.unit === undefined ? 'KG' : opts.unit,
      weightGrams: opts.weightGrams === undefined ? null : opts.weightGrams,
      categorySlug:
        opts.categorySlug === undefined ? null : opts.categorySlug,
      availability:
        opts.availability === undefined ? 'AVAILABLE' : opts.availability,
      rawFieldsSeen: {},
    },
  })
  await db.ingestionReviewQueueItem.create({
    data: { kind: 'PRODUCT_DRAFT', targetId: draft.id, state: 'ENQUEUED' },
  })
  return { draft, message, extraction }
}

async function withAdmin<T>(fn: () => Promise<T>): Promise<T> {
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
  setTestFlagOverrides({
    [INGESTION_ADMIN_FEATURE_FLAG]: true,
    [INGESTION_PUBLISH_FEATURE_FLAG]: true,
  })
})

afterEach(() => {
  clearTestFlagOverrides()
  clearTestSession()
})

// ─── happy path ──────────────────────────────────────────────────────

test('publish: happy path creates Product + ghost Vendor + ghost User, resolves draft', async () => {
  const { draft, message } = await seedProductDraft()
  const result = await withAdmin(() => publishApprovedDraft({ draftId: draft.id }))

  assert.equal(result.status, 'CREATED')
  assert.ok(result.productId)
  assert.ok(result.vendorId)
  assert.ok(result.ghostUserId)

  const product = await db.product.findUniqueOrThrow({ where: { id: result.productId } })
  assert.equal(product.status, 'PENDING_REVIEW')
  assert.equal(product.name, 'Manzanas golden')
  assert.equal(product.basePrice.toString(), '2.5')
  assert.equal(product.unit, 'kg')
  assert.equal(product.stock, 1)
  assert.equal(product.trackStock, false)
  assert.equal(product.sourceIngestionDraftId, draft.id)
  assert.equal(product.sourceTelegramMessageId, message.id)
  assert.equal(product.categoryId, 'cat_uncategorized')

  const vendor = await db.vendor.findUniqueOrThrow({ where: { id: result.vendorId } })
  assert.equal(vendor.status, 'APPLYING')
  assert.equal(vendor.stripeOnboarded, false)
  assert.equal(vendor.userId, result.ghostUserId)

  const user = await db.user.findUniqueOrThrow({ where: { id: result.ghostUserId } })
  assert.equal(user.email, 'tg-424242@ingestion.ghost.local')
  assert.equal(user.isActive, false)
  assert.equal(user.emailVerified, null)
  assert.equal(user.passwordHash, null)

  const updatedDraft = await db.ingestionProductDraft.findUniqueOrThrow({ where: { id: draft.id } })
  assert.equal(updatedDraft.status, 'APPROVED')

  const reviewItem = await db.ingestionReviewQueueItem.findFirstOrThrow({
    where: { kind: 'PRODUCT_DRAFT', targetId: draft.id },
  })
  assert.equal(reviewItem.state, 'AUTO_RESOLVED')
  assert.equal(reviewItem.autoResolvedReason, 'adminApproved')

  const auditRows = await db.auditLog.findMany({
    where: { entityType: 'IngestionProductDraft', entityId: draft.id },
  })
  assert.equal(auditRows.length, 1)
  assert.equal(auditRows[0]!.action, 'INGESTION_DRAFT_PUBLISHED')
  const after = auditRows[0]!.after as Record<string, unknown>
  assert.equal(after.productId, result.productId)
  assert.equal(after.vendorId, result.vendorId)
  assert.equal(after.ghostUserId, result.ghostUserId)
  assert.equal(after.sourceMessageId, message.id)
})

test('publish: honours categorySlug when it resolves to an existing Category', async () => {
  const cat = await db.category.create({
    data: { name: 'Frutas', slug: 'frutas', isActive: true },
  })
  const { draft } = await seedProductDraft({ categorySlug: 'frutas' })
  const result = await withAdmin(() => publishApprovedDraft({ draftId: draft.id }))
  const product = await db.product.findUniqueOrThrow({ where: { id: result.productId } })
  assert.equal(product.categoryId, cat.id)
})

test('publish: unknown categorySlug falls back to cat_uncategorized without error', async () => {
  const { draft } = await seedProductDraft({ categorySlug: 'this-category-does-not-exist' })
  const result = await withAdmin(() => publishApprovedDraft({ draftId: draft.id }))
  const product = await db.product.findUniqueOrThrow({ where: { id: result.productId } })
  assert.equal(product.categoryId, 'cat_uncategorized')
})

test('publish: availability=UNKNOWN sets stock=0, AVAILABLE sets stock=1', async () => {
  const { draft: draftAvail } = await seedProductDraft({ availability: 'AVAILABLE' })
  const a = await withAdmin(() => publishApprovedDraft({ draftId: draftAvail.id }))
  const pa = await db.product.findUniqueOrThrow({ where: { id: a.productId } })
  assert.equal(pa.stock, 1)

  const { draft: draftUnknown } = await seedProductDraft({
    availability: 'UNKNOWN',
    tgAuthorId: '999999',
  })
  const b = await withAdmin(() => publishApprovedDraft({ draftId: draftUnknown.id }))
  const pb = await db.product.findUniqueOrThrow({ where: { id: b.productId } })
  assert.equal(pb.stock, 0)
})

// ─── idempotency ─────────────────────────────────────────────────────

test('publish: idempotent — same draft twice returns same Product, no duplicate ghosts', async () => {
  const { draft } = await seedProductDraft()
  const first = await withAdmin(() => publishApprovedDraft({ draftId: draft.id }))
  assert.equal(first.status, 'CREATED')

  const second = await withAdmin(() => publishApprovedDraft({ draftId: draft.id }))
  assert.equal(second.status, 'IDEMPOTENT')
  assert.equal(second.productId, first.productId)
  assert.equal(second.vendorId, first.vendorId)
  assert.equal(second.ghostUserId, first.ghostUserId)

  const products = await db.product.findMany({ where: { sourceIngestionDraftId: draft.id } })
  assert.equal(products.length, 1)
  const vendors = await db.vendor.count()
  assert.equal(vendors, 1)
  const users = await db.user.count({
    where: { email: { startsWith: 'tg-' } },
  })
  assert.equal(users, 1)
})

test('publish: two drafts from same tgAuthorId reuse the ghost User+Vendor and create two Products', async () => {
  const { draft: d1 } = await seedProductDraft({ tgAuthorId: '555', productName: 'A' })
  const { draft: d2 } = await seedProductDraft({ tgAuthorId: '555', productName: 'B' })

  const r1 = await withAdmin(() => publishApprovedDraft({ draftId: d1.id }))
  const r2 = await withAdmin(() => publishApprovedDraft({ draftId: d2.id }))

  assert.equal(r1.status, 'CREATED')
  assert.equal(r2.status, 'CREATED')
  assert.notEqual(r1.productId, r2.productId)
  assert.equal(r1.vendorId, r2.vendorId)
  assert.equal(r1.ghostUserId, r2.ghostUserId)

  const ghostUsers = await db.user.count({
    where: { email: 'tg-555@ingestion.ghost.local' },
  })
  assert.equal(ghostUsers, 1)
  const ghostVendors = await db.vendor.count({
    where: { userId: r1.ghostUserId },
  })
  assert.equal(ghostVendors, 1)
})

test('publish: two drafts from DIFFERENT authors create two ghost User+Vendor pairs', async () => {
  const { draft: d1 } = await seedProductDraft({ tgAuthorId: '111' })
  const { draft: d2 } = await seedProductDraft({ tgAuthorId: '222' })

  const r1 = await withAdmin(() => publishApprovedDraft({ draftId: d1.id }))
  const r2 = await withAdmin(() => publishApprovedDraft({ draftId: d2.id }))

  assert.notEqual(r1.ghostUserId, r2.ghostUserId)
  assert.notEqual(r1.vendorId, r2.vendorId)
  const users = await db.user.count({ where: { email: { startsWith: 'tg-' } } })
  assert.equal(users, 2)
})

// ─── validation blocks ───────────────────────────────────────────────

test('publish: refuses when the source message has no tgAuthorId', async () => {
  const { draft } = await seedProductDraft({ tgAuthorId: null })
  await assert.rejects(
    () => withAdmin(() => publishApprovedDraft({ draftId: draft.id })),
    (err: unknown) =>
      err instanceof IngestionPublishValidationError && err.reason === 'missingAuthor',
  )
  assert.equal(await db.product.count(), 0)
  assert.equal(await db.vendor.count(), 0)
})

test('publish: refuses when priceCents is null', async () => {
  const { draft } = await seedProductDraft({ priceCents: null })
  await assert.rejects(
    () => withAdmin(() => publishApprovedDraft({ draftId: draft.id })),
    (err: unknown) =>
      err instanceof IngestionPublishValidationError && err.reason === 'invalidPrice',
  )
})

test('publish: refuses when priceCents is zero or negative', async () => {
  const { draft: zero } = await seedProductDraft({ priceCents: 0 })
  await assert.rejects(
    () => withAdmin(() => publishApprovedDraft({ draftId: zero.id })),
    (err: unknown) =>
      err instanceof IngestionPublishValidationError && err.reason === 'invalidPrice',
  )
  const { draft: negative } = await seedProductDraft({ priceCents: -10 })
  await assert.rejects(
    () => withAdmin(() => publishApprovedDraft({ draftId: negative.id })),
    (err: unknown) =>
      err instanceof IngestionPublishValidationError && err.reason === 'invalidPrice',
  )
})

test('publish: refuses when productName sanitises to empty string', async () => {
  const { draft } = await seedProductDraft({ productName: '   \n\t  ' })
  await assert.rejects(
    () => withAdmin(() => publishApprovedDraft({ draftId: draft.id })),
    (err: unknown) =>
      err instanceof IngestionPublishValidationError && err.reason === 'emptyName',
  )
})

test('publish: refuses when currency is not EUR', async () => {
  const { draft } = await seedProductDraft({ currencyCode: 'USD' })
  await assert.rejects(
    () => withAdmin(() => publishApprovedDraft({ draftId: draft.id })),
    (err: unknown) =>
      err instanceof IngestionPublishValidationError && err.reason === 'unsupportedCurrency',
  )
})

test('publish: refuses when draft is already REJECTED', async () => {
  const { draft } = await seedProductDraft({ draftStatus: 'REJECTED' })
  await assert.rejects(
    () => withAdmin(() => publishApprovedDraft({ draftId: draft.id })),
    (err: unknown) =>
      err instanceof IngestionPublishValidationError && err.reason === 'alreadyResolved',
  )
})

test('publish: missing draft returns a clean validation error', async () => {
  await assert.rejects(
    () => withAdmin(() => publishApprovedDraft({ draftId: 'no-such-draft' })),
    (err: unknown) =>
      err instanceof IngestionPublishValidationError && err.reason === 'notFound',
  )
})

// ─── flag gating ─────────────────────────────────────────────────────

test('publish: blocked when feat-ingestion-publish is off even with admin flag on', async () => {
  const { draft } = await seedProductDraft()
  setTestFlagOverrides({
    [INGESTION_ADMIN_FEATURE_FLAG]: true,
    [INGESTION_PUBLISH_FEATURE_FLAG]: false,
  })
  await assert.rejects(
    () => withAdmin(() => publishApprovedDraft({ draftId: draft.id })),
    (err: unknown) =>
      err instanceof IngestionPublishValidationError && err.reason === 'flagOff',
  )
  // No side effects.
  assert.equal(await db.product.count(), 0)
  assert.equal(await db.vendor.count(), 0)
  const unchanged = await db.ingestionProductDraft.findUniqueOrThrow({ where: { id: draft.id } })
  assert.equal(unchanged.status, 'PENDING')
})
