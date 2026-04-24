import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import {
  INGESTION_ADMIN_FEATURE_FLAG,
  INGESTION_PUBLISH_FEATURE_FLAG,
  publishApprovedDraft,
} from '@/domains/ingestion'
import { claimGhostVendor } from '@/domains/vendors/claim'
import { VendorClaimError } from '@/domains/vendors/claim-errors'
import {
  buildSession,
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'
import { clearTestFlagOverrides, setTestFlagOverrides } from '../flags-helper'

/**
 * Phase 4 PR-E — ghost vendor claim flow end-to-end against real
 * Postgres.
 *
 * Covered:
 *   - Publish auto-generates a `claimCode` with expiry.
 *   - A real user can claim the vendor: ownership transfers, role
 *     bumps to VENDOR, claim fields clear, ghost User is deleted.
 *   - Second claim of the same code returns `notFound` (single-use).
 *   - An expired code returns `expired`.
 *   - A user that already owns a vendor cannot claim another one.
 *   - The claim preserves Products (they stay attached to the same
 *     vendor row whose userId just moved).
 */

async function seedPendingDraft(tgAuthorId: string) {
  const connection = await db.telegramIngestionConnection.create({
    data: {
      label: `Claim test ${randomUUID().slice(0, 6)}`,
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
  const message = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(Math.floor(Math.random() * 1_000_000_000)),
      tgAuthorId: BigInt(tgAuthorId),
      text: 'seed',
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
      inputSnapshot: { text: 'seed' },
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
      status: 'PENDING',
      confidenceOverall: 0.85,
      confidenceBand: 'HIGH',
      productName: 'Manzanas claim test',
      priceCents: 250,
      currencyCode: 'EUR',
      unit: 'KG',
      availability: 'AVAILABLE',
      rawFieldsSeen: {},
    },
  })
  await db.ingestionReviewQueueItem.create({
    data: { kind: 'PRODUCT_DRAFT', targetId: draft.id, state: 'ENQUEUED' },
  })
  return draft
}

async function publishAsAdmin(draftId: string) {
  const adminUser = await createUser('ADMIN_OPS')
  useTestSession(buildSession(adminUser.id, 'ADMIN_OPS'))
  try {
    return await publishApprovedDraft({ draftId })
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

// ─── happy path ───────────────────────────────────────────────────────

test('claim: publish issues a claimCode + expiry on the ghost vendor', async () => {
  const draft = await seedPendingDraft('501501501')
  const result = await publishAsAdmin(draft.id)
  const vendor = await db.vendor.findUniqueOrThrow({ where: { id: result.vendorId } })
  assert.ok(vendor.claimCode, 'claimCode should be issued at publish time')
  assert.equal(vendor.claimCode?.length, 8)
  assert.match(vendor.claimCode!, /^[A-HJKMNP-Z2-9]+$/, 'only unambiguous alphabet')
  assert.ok(vendor.claimCodeExpiresAt)
  const daysOut = (vendor.claimCodeExpiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  assert.ok(daysOut > 364 && daysOut < 366, 'TTL ~= 365 days')
})

test('claim: real user redeems the code, ownership transfers, ghost user is deleted', async () => {
  const draft = await seedPendingDraft('600600600')
  const published = await publishAsAdmin(draft.id)
  const vendor = await db.vendor.findUniqueOrThrow({ where: { id: published.vendorId } })

  const realUser = await createUser('CUSTOMER')
  useTestSession(buildSession(realUser.id, 'CUSTOMER'))
  const claimed = await claimGhostVendor({ code: vendor.claimCode! })

  assert.equal(claimed.vendorId, vendor.id)
  assert.equal(claimed.vendorSlug, vendor.slug)

  // Vendor now owned by the real user, claim fields cleared.
  const after = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })
  assert.equal(after.userId, realUser.id)
  assert.equal(after.claimCode, null)
  assert.equal(after.claimCodeExpiresAt, null)

  // Real user promoted to VENDOR.
  const userAfter = await db.user.findUniqueOrThrow({ where: { id: realUser.id } })
  assert.equal(userAfter.role, 'VENDOR')

  // Ghost user deleted.
  const ghost = await db.user.findUnique({ where: { id: published.ghostUserId } })
  assert.equal(ghost, null)

  // Product still attached to the same vendor (nothing about its
  // row changed — only Vendor.userId moved).
  const product = await db.product.findUniqueOrThrow({ where: { id: published.productId } })
  assert.equal(product.vendorId, vendor.id)

  // Audit row written.
  const audit = await db.auditLog.findFirstOrThrow({
    where: { action: 'VENDOR_CLAIMED', entityId: vendor.id },
  })
  const after_ = audit.after as Record<string, unknown>
  assert.equal(after_.ownerUserId, realUser.id)
})

test('claim: second redemption of the same code returns notFound (single-use)', async () => {
  const draft = await seedPendingDraft('700700700')
  const published = await publishAsAdmin(draft.id)
  const vendor = await db.vendor.findUniqueOrThrow({ where: { id: published.vendorId } })
  const code = vendor.claimCode!

  const firstUser = await createUser('CUSTOMER')
  useTestSession(buildSession(firstUser.id, 'CUSTOMER'))
  await claimGhostVendor({ code })
  clearTestSession()

  const secondUser = await createUser('CUSTOMER')
  useTestSession(buildSession(secondUser.id, 'CUSTOMER'))
  await assert.rejects(
    () => claimGhostVendor({ code }),
    (err: unknown) => err instanceof VendorClaimError && err.reason === 'notFound',
  )
})

// ─── validation / failure modes ───────────────────────────────────────

test('claim: unauthenticated caller is rejected', async () => {
  // `clearTestSession()` sets the override to `undefined`, which
  // makes getActionSession fall through to real auth. We need an
  // explicit `null` override to simulate "no session" in tests.
  useTestSession(null)
  await assert.rejects(
    () => claimGhostVendor({ code: 'AAAAAAAA' }),
    (err: unknown) => err instanceof VendorClaimError && err.reason === 'unauthenticated',
  )
})

test('claim: invalid code shape returns invalidCode', async () => {
  const user = await createUser('CUSTOMER')
  useTestSession(buildSession(user.id, 'CUSTOMER'))
  await assert.rejects(
    () => claimGhostVendor({ code: 'short' }),
    (err: unknown) => err instanceof VendorClaimError && err.reason === 'invalidCode',
  )
  await assert.rejects(
    () => claimGhostVendor({ code: 'with spa' }),
    (err: unknown) => err instanceof VendorClaimError && err.reason === 'invalidCode',
  )
})

test('claim: unknown code returns notFound', async () => {
  const user = await createUser('CUSTOMER')
  useTestSession(buildSession(user.id, 'CUSTOMER'))
  await assert.rejects(
    () => claimGhostVendor({ code: 'ZZZZZZZZ' }),
    (err: unknown) => err instanceof VendorClaimError && err.reason === 'notFound',
  )
})

test('claim: expired code returns expired without transferring ownership', async () => {
  const draft = await seedPendingDraft('800800800')
  const published = await publishAsAdmin(draft.id)
  // Backdate the expiry.
  await db.vendor.update({
    where: { id: published.vendorId },
    data: { claimCodeExpiresAt: new Date(Date.now() - 60 * 1000) },
  })
  const vendor = await db.vendor.findUniqueOrThrow({ where: { id: published.vendorId } })

  const user = await createUser('CUSTOMER')
  useTestSession(buildSession(user.id, 'CUSTOMER'))
  await assert.rejects(
    () => claimGhostVendor({ code: vendor.claimCode! }),
    (err: unknown) => err instanceof VendorClaimError && err.reason === 'expired',
  )
  const unchanged = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })
  assert.equal(unchanged.userId, published.ghostUserId, 'ownership untouched on expired claim')
})

test('claim: caller who already owns a vendor cannot claim another', async () => {
  // Arrange: caller has their own vendor already
  const draftA = await seedPendingDraft('910')
  await publishAsAdmin(draftA.id)

  const realUser = await createUser('CUSTOMER')
  await db.vendor.create({
    data: {
      userId: realUser.id,
      slug: `user-${realUser.id.slice(0, 6)}`,
      displayName: 'My own vendor',
      status: 'APPLYING',
    },
  })

  // And there is another ghost vendor out there to try claiming.
  const draftB = await seedPendingDraft('920')
  const other = await publishAsAdmin(draftB.id)
  const otherVendor = await db.vendor.findUniqueOrThrow({ where: { id: other.vendorId } })

  useTestSession(buildSession(realUser.id, 'CUSTOMER'))
  await assert.rejects(
    () => claimGhostVendor({ code: otherVendor.claimCode! }),
    (err: unknown) => err instanceof VendorClaimError && err.reason === 'alreadyVendor',
  )
})

test('claim: code is case-insensitive and tolerates surrounding whitespace', async () => {
  const draft = await seedPendingDraft('1010101010')
  const published = await publishAsAdmin(draft.id)
  const vendor = await db.vendor.findUniqueOrThrow({ where: { id: published.vendorId } })

  const user = await createUser('CUSTOMER')
  useTestSession(buildSession(user.id, 'CUSTOMER'))
  const lowerWithSpaces = `  ${vendor.claimCode!.toLowerCase()}  `
  const claimed = await claimGhostVendor({ code: lowerWithSpaces })
  assert.equal(claimed.vendorId, vendor.id)
})
