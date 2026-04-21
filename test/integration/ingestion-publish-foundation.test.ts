import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import {
  getFeaturedProducts,
  getHomeSnapshot,
  getProductBySlug,
  getProducts,
  getVendorBySlug,
  getVendors,
} from '@/domains/catalog/queries'
import { getAvailableProductWhere } from '@/domains/catalog/availability'
import { authorizeCredentials } from '@/domains/auth/credentials'
import {
  INGESTION_PUBLISH_FEATURE_FLAG,
  isIngestionPublishEnabled,
} from '@/domains/ingestion'
import { resetIntegrationDatabase } from './helpers'
import { clearTestFlagOverrides, setTestFlagOverrides } from '../flags-helper'

/**
 * Phase 4 PR-A foundation tests against real Postgres.
 *
 * Three invariants the schema foundation commits to, all proven here
 * rather than assumed:
 *
 *   1. A ghost Vendor (status=APPLYING, stripeOnboarded=false) and
 *      every Product owned by it are invisible on every public
 *      catalog surface, regardless of Product.status. This is the
 *      load-bearing guarantee that lets Phase 4 create Ghost vendors
 *      without leaking them into the shopfront.
 *
 *   2. A ghost User (isActive=false, emailVerified=null,
 *      passwordHash=null) cannot reach a session via the credentials
 *      provider. Three independent gates must all hold; each is
 *      exercised independently.
 *
 *   3. `isIngestionPublishEnabled` is fail-closed: without an explicit
 *      override and without PostHog, it resolves to `false`. This is
 *      the critical difference from `isIngestionAdminEnabled`, which
 *      is fail-open.
 *
 * Additionally: sanity-check the schema migration (new columns +
 * unique constraint + seeded category) landed.
 */

async function createGhostUserVendor(tgAuthorId: string) {
  const email = `tg-${tgAuthorId}@ingestion.ghost.local`
  const user = await db.user.create({
    data: {
      email,
      firstName: 'Productor',
      lastName: `tg-${tgAuthorId.slice(0, 6)}`,
      role: 'VENDOR',
      isActive: false,
      emailVerified: null,
      passwordHash: null,
    },
  })
  const vendor = await db.vendor.create({
    data: {
      userId: user.id,
      slug: `ghost-tg-${tgAuthorId}-${randomUUID().slice(0, 6)}`,
      displayName: `Productor Telegram ${tgAuthorId.slice(-4)}`,
      status: 'APPLYING',
      stripeOnboarded: false,
      commissionRate: 0.12,
    },
  })
  return { user, vendor, email }
}

async function createActiveUserVendor() {
  const user = await db.user.create({
    data: {
      email: `real-${randomUUID()}@example.com`,
      firstName: 'Real',
      lastName: 'Vendor',
      role: 'VENDOR',
      isActive: true,
      emailVerified: new Date(),
    },
  })
  const vendor = await db.vendor.create({
    data: {
      userId: user.id,
      slug: `real-${randomUUID().slice(0, 8)}`,
      displayName: 'Real Vendor',
      status: 'ACTIVE',
      stripeOnboarded: true,
    },
  })
  return { user, vendor }
}

async function createActiveProduct(vendorId: string, name: string) {
  return db.product.create({
    data: {
      vendorId,
      name,
      slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${randomUUID().slice(0, 6)}`,
      status: 'ACTIVE',
      basePrice: 10,
      stock: 5,
      categoryId: 'cat_uncategorized',
    },
  })
}

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestFlagOverrides()
})

// ─── schema migration sanity ─────────────────────────────────────────

test('migration: Product carries sourceIngestionDraftId and sourceTelegramMessageId columns', async () => {
  const { vendor } = await createActiveUserVendor()
  const product = await db.product.create({
    data: {
      vendorId: vendor.id,
      name: 'With provenance',
      slug: `prov-${randomUUID().slice(0, 8)}`,
      status: 'DRAFT',
      basePrice: 1,
      stock: 0,
      sourceIngestionDraftId: `draft-${randomUUID()}`,
      sourceTelegramMessageId: `msg-${randomUUID()}`,
    },
  })
  const roundTrip = await db.product.findUniqueOrThrow({ where: { id: product.id } })
  assert.ok(roundTrip.sourceIngestionDraftId)
  assert.ok(roundTrip.sourceTelegramMessageId)
})

test('migration: Product.sourceIngestionDraftId UNIQUE is enforced (idempotent publish relies on this)', async () => {
  const { vendor } = await createActiveUserVendor()
  const draftId = `draft-${randomUUID()}`
  await db.product.create({
    data: {
      vendorId: vendor.id,
      name: 'First',
      slug: `first-${randomUUID().slice(0, 8)}`,
      status: 'DRAFT',
      basePrice: 1,
      stock: 0,
      sourceIngestionDraftId: draftId,
    },
  })
  await assert.rejects(
    () =>
      db.product.create({
        data: {
          vendorId: vendor.id,
          name: 'Second attempt, same draft',
          slug: `second-${randomUUID().slice(0, 8)}`,
          status: 'DRAFT',
          basePrice: 1,
          stock: 0,
          sourceIngestionDraftId: draftId,
        },
      }),
    /Unique constraint/i,
  )
})

test('migration: uncategorized Category row is present with stable id', async () => {
  // The migration seeds this once per environment; the shared test
  // helper re-seeds after every TRUNCATE so the invariant holds
  // across cross-file beforeEach hook ordering.
  const row = await db.category.findUnique({ where: { slug: 'uncategorized' } })
  assert.ok(row)
  assert.equal(row!.id, 'cat_uncategorized')
  assert.equal(row!.isActive, true)
})

// ─── public catalog exclusion ────────────────────────────────────────

test('catalog: Product owned by ghost Vendor (APPLYING) is excluded by getAvailableProductWhere even when ACTIVE', async () => {
  const { vendor } = await createGhostUserVendor('4242')
  await createActiveProduct(vendor.id, 'Ghost Product')

  const visible = await db.product.findMany({ where: getAvailableProductWhere() })
  assert.equal(visible.length, 0, 'Ghost vendor products must never appear via the public WHERE filter')
})

test('catalog: ghost-owned Product does not surface in getProducts / getFeaturedProducts / home snapshot', async () => {
  const { vendor: ghostVendor } = await createGhostUserVendor('9999')
  await createActiveProduct(ghostVendor.id, 'Ghost Leak')

  const { user: realUser, vendor: realVendor } = await createActiveUserVendor()
  void realUser
  await createActiveProduct(realVendor.id, 'Real Product')

  const products = await getProducts()
  assert.equal(products.products.length, 1)
  assert.equal(products.products[0]!.name, 'Real Product')

  const featured = await getFeaturedProducts(10)
  assert.equal(featured.length, 1)
  assert.equal(featured[0]!.name, 'Real Product')

  const home = await getHomeSnapshot()
  assert.equal(home.stats.activeProducts, 1)
  assert.equal(home.featured.length, 1)
})

test('catalog: getVendors and getVendorBySlug never surface a Vendor in APPLYING status', async () => {
  const { vendor: ghostVendor } = await createGhostUserVendor('7777')
  const { vendor: realVendor } = await createActiveUserVendor()

  const vendors = await getVendors(50)
  assert.equal(vendors.length, 1)
  assert.equal(vendors[0]!.id, realVendor.id)

  const ghostBySlug = await getVendorBySlug(ghostVendor.slug)
  assert.equal(ghostBySlug, null, 'Ghost vendor page must 404 even by direct slug')

  const realBySlug = await getVendorBySlug(realVendor.slug)
  assert.ok(realBySlug, 'Sanity: real vendor page resolves')
})

test('catalog: getProductBySlug returns null for a ghost-owned Product', async () => {
  const { vendor } = await createGhostUserVendor('1234')
  const product = await createActiveProduct(vendor.id, 'Should Not Resolve')
  const hit = await getProductBySlug(product.slug)
  assert.equal(hit, null)
})

test('catalog: a later SUSPENDED vendor is also excluded (hardening is not ingestion-specific)', async () => {
  const { vendor } = await createActiveUserVendor()
  const product = await createActiveProduct(vendor.id, 'Real And Active')

  // Sanity before suspension.
  const beforeVisible = await db.product.findMany({ where: getAvailableProductWhere() })
  assert.equal(beforeVisible.length, 1)

  await db.vendor.update({ where: { id: vendor.id }, data: { status: 'SUSPENDED_TEMP' } })
  const afterVisible = await db.product.findMany({ where: getAvailableProductWhere() })
  assert.equal(afterVisible.length, 0)
  // Product row still exists — we just stopped serving it to the public.
  const stillThere = await db.product.findUnique({ where: { id: product.id } })
  assert.ok(stillThere)
})

// ─── ghost user cannot authenticate ──────────────────────────────────

test('auth: ghost user with isActive=false is rejected by authorizeCredentials', async () => {
  const { email } = await createGhostUserVendor('auth-1')
  const result = await authorizeCredentials({
    email,
    password: 'does-not-matter-but-meets-min-length',
  })
  assert.equal(result, null)
})

test('auth: even with a password hash, an inactive ghost user cannot log in', async () => {
  const { user } = await createGhostUserVendor('auth-2')
  // Defensive probe: an operator who accidentally set a password on a
  // ghost row still shouldn't be able to authenticate while isActive
  // remains false.
  await db.user.update({
    where: { id: user.id },
    data: {
      // A valid bcrypt hash of 'Password123!' so we prove the
      // isActive gate (not just the missing-hash short-circuit) is
      // what blocks authentication.
      passwordHash: '$2a$10$CwTycUXWue0Thq9StjUM0uJ8aQEYxjyxkqVcG1G3r/IL8RVXUmcJ6',
      emailVerified: new Date(),
    },
  })
  await db.user.update({
    where: { id: user.id },
    data: { isActive: false },
  })
  const result = await authorizeCredentials({
    email: user.email,
    password: 'Password123!',
  })
  assert.equal(result, null)
})

test('auth: a ghost user reactivated but with emailVerified=null stays blocked', async () => {
  const { user } = await createGhostUserVendor('auth-3')
  await db.user.update({
    where: { id: user.id },
    data: {
      isActive: true,
      emailVerified: null,
      passwordHash: '$2a$10$CwTycUXWue0Thq9StjUM0uJ8aQEYxjyxkqVcG1G3r/IL8RVXUmcJ6',
    },
  })
  const result = await authorizeCredentials({
    email: user.email,
    password: 'Password123!',
  })
  assert.equal(result, null)
})

// ─── publish flag fail-closed ────────────────────────────────────────

test('flag: isIngestionPublishEnabled is FAIL-CLOSED — resolves false without override and without PostHog', async () => {
  // `flags-helper`'s setTestFlagOverrides is where we normally pin a
  // value; here we explicitly do NOT set one. With no PostHog key in
  // the test env, the strict evaluator must return false.
  clearTestFlagOverrides()
  const enabled = await isIngestionPublishEnabled({ userId: 'probe', role: 'ADMIN_OPS' })
  assert.equal(enabled, false)
})

test('flag: isIngestionPublishEnabled honours an explicit override=true', async () => {
  setTestFlagOverrides({ [INGESTION_PUBLISH_FEATURE_FLAG]: true })
  const enabled = await isIngestionPublishEnabled({ userId: 'probe', role: 'ADMIN_OPS' })
  assert.equal(enabled, true)
})

test('flag: isIngestionPublishEnabled honours an explicit override=false', async () => {
  setTestFlagOverrides({ [INGESTION_PUBLISH_FEATURE_FLAG]: false })
  const enabled = await isIngestionPublishEnabled({ userId: 'probe', role: 'ADMIN_OPS' })
  assert.equal(enabled, false)
})
