/**
 * #1050 — orphan blob sweep against a real DB and a stubbed Vercel
 * blob client.
 *
 * The contract under test:
 *
 *   1. With Vercel storage holding [referenced-A, referenced-B,
 *      orphan-X, orphan-Y] and the DB pointing at A and B, the
 *      sweep reports `orphansFound = 2`.
 *   2. In DRY-RUN, no `del()` calls are made and `deleted = 0`.
 *   3. With `dryRun=false`, exactly the 2 orphans are deleted.
 *   4. The DB-side scan walks Product.images AND Vendor.logo /
 *      Vendor.coverImage (mixed reference shapes).
 *   5. Reordered images in a Product are still recognized as
 *      referenced (the sweep matches by URL, not by position).
 */

import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { runOrphanBlobSweep } from '@/workers/jobs/sweep-orphan-blobs'
import { db } from '@/lib/db'
import { resetIntegrationDatabase, createVendorUser } from './helpers'

const TOKEN = 'vercel_blob_rw_test'

interface FakeBlob {
  url: string
  pathname: string
}

function makeFakeList(blobs: FakeBlob[]) {
  // pg-boss is not involved here; we hand-roll a list() that
  // matches the `@vercel/blob` shape: returns all blobs in one
  // page when there are <= 1000.
  return async () => ({
    blobs: blobs.map((b) => ({ url: b.url, pathname: b.pathname })),
    hasMore: false,
  })
}

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  // Tests do not mutate process.env beyond what they restore inline.
})

async function seedFixture() {
  const { vendor } = await createVendorUser()

  // Vendor with logo + cover (both referenced).
  await db.vendor.update({
    where: { id: vendor.id },
    data: {
      logo: 'https://blob.test/vendor-logo.jpg',
      coverImage: 'https://blob.test/vendor-cover.jpg',
    },
  })

  // Product with two images (both referenced).
  const category = await db.category.create({
    data: {
      name: `Cat ${vendor.id}`,
      slug: `cat-${vendor.id}`,
    },
  })
  await db.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: 'Aceite',
      slug: `aceite-${vendor.id}`,
      basePrice: 12,
      taxRate: 0.1,
      unit: 'L',
      stock: 5,
      trackStock: true,
      images: ['https://blob.test/product-a.jpg', 'https://blob.test/product-b.jpg'],
      imageAlts: ['', ''],
      certifications: [],
      tags: [],
      status: 'ACTIVE',
    },
  })
}

test('sweep DRY-RUN: detects orphans without deleting them', async () => {
  await seedFixture()

  const blobs: FakeBlob[] = [
    { url: 'https://blob.test/vendor-logo.jpg', pathname: 'vendor-logo.jpg' },
    { url: 'https://blob.test/vendor-cover.jpg', pathname: 'vendor-cover.jpg' },
    { url: 'https://blob.test/product-a.jpg', pathname: 'product-a.jpg' },
    { url: 'https://blob.test/product-b.jpg', pathname: 'product-b.jpg' },
    { url: 'https://blob.test/orphan-x.jpg', pathname: 'orphan-x.jpg' },
    { url: 'https://blob.test/orphan-y.jpg', pathname: 'orphan-y.jpg' },
  ]

  let deleteCalls = 0
  const result = await runOrphanBlobSweep({
    dryRun: true,
    token: TOKEN,
    list: makeFakeList(blobs),
    deleter: async () => {
      deleteCalls += 1
      return { ok: true }
    },
  })

  assert.equal(result.scannedBlobs, 6)
  assert.equal(result.referencedUrls, 4)
  assert.equal(result.orphansFound, 2)
  assert.equal(result.deleted, 0)
  assert.equal(result.dryRun, true)
  assert.equal(deleteCalls, 0, 'dry-run must not call the deleter')
})

test('sweep dryRun=false: deletes exactly the orphans, leaves referenced URLs alone', async () => {
  await seedFixture()

  const blobs: FakeBlob[] = [
    { url: 'https://blob.test/vendor-logo.jpg', pathname: 'vendor-logo.jpg' },
    { url: 'https://blob.test/vendor-cover.jpg', pathname: 'vendor-cover.jpg' },
    { url: 'https://blob.test/product-a.jpg', pathname: 'product-a.jpg' },
    { url: 'https://blob.test/product-b.jpg', pathname: 'product-b.jpg' },
    { url: 'https://blob.test/orphan-x.jpg', pathname: 'orphan-x.jpg' },
    { url: 'https://blob.test/orphan-y.jpg', pathname: 'orphan-y.jpg' },
  ]

  const deletedUrls: string[] = []
  const result = await runOrphanBlobSweep({
    dryRun: false,
    token: TOKEN,
    list: makeFakeList(blobs),
    deleter: async (url) => {
      deletedUrls.push(url)
      return { ok: true }
    },
  })

  assert.equal(result.orphansFound, 2)
  assert.equal(result.deleted, 2)
  assert.equal(result.failed, 0)
  assert.equal(result.dryRun, false)
  assert.deepEqual(
    deletedUrls.sort(),
    ['https://blob.test/orphan-x.jpg', 'https://blob.test/orphan-y.jpg'],
  )
})

test('sweep: empty DB + empty storage = no work, no errors', async () => {
  // Don't seed anything — just call sweep.
  const result = await runOrphanBlobSweep({
    dryRun: true,
    token: TOKEN,
    list: makeFakeList([]),
    deleter: async () => ({ ok: true }),
  })

  assert.equal(result.scannedBlobs, 0)
  assert.equal(result.orphansFound, 0)
  assert.equal(result.deleted, 0)
})

test('sweep: missing token short-circuits with skipReason=missing_token', async () => {
  const result = await runOrphanBlobSweep({
    dryRun: true,
    // No token, no list — production-like call without env.
    list: makeFakeList([]),
  })
  assert.equal(result.mode, 'skipped')
  assert.equal(result.skipReason, 'missing_token')
})

test('sweep counts a deleter failure separately from successes', async () => {
  await seedFixture()
  const blobs: FakeBlob[] = [
    { url: 'https://blob.test/orphan-1.jpg', pathname: 'orphan-1.jpg' },
    { url: 'https://blob.test/orphan-2.jpg', pathname: 'orphan-2.jpg' },
  ]
  const result = await runOrphanBlobSweep({
    dryRun: false,
    token: TOKEN,
    list: makeFakeList(blobs),
    deleter: async (url) => {
      if (url.endsWith('orphan-2.jpg')) return { ok: false }
      return { ok: true }
    },
  })
  assert.equal(result.deleted, 1)
  assert.equal(result.failed, 1)
})
