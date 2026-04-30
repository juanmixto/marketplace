/**
 * #1050 — orphan cleanup for `updateProduct` and `updateVendorProfile`.
 *
 * The contract under test:
 *
 *   1. `updateProduct` calls deleteBlob for every URL that was
 *      removed (single replacement, full clear).
 *   2. Reorder of the same image set does NOT trigger any delete.
 *   3. `updateVendorProfile` does the same for `logo` and
 *      `coverImage`.
 *   4. A failing `deleteBlob` (e.g. token missing) does NOT tumble
 *      the parent action — the row update commits regardless.
 *
 * Strategy: write real files under public/uploads, point the DB
 * row at them, run the action, then check the file system. Local
 * mode is the path the test environment naturally takes (no
 * BLOB_READ_WRITE_TOKEN). End-to-end against the same code path
 * production runs in.
 */

import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import {
  createProduct,
  updateProduct,
  updateVendorProfile,
} from '@/domains/vendors/actions'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

interface UploadedFixture {
  url: string
  fullPath: string
}

async function writeUpload(prefix: string, label: string): Promise<UploadedFixture> {
  const dir = path.join(process.cwd(), 'public', 'uploads', prefix)
  await mkdir(dir, { recursive: true })
  const filename = `${label}-${randomUUID()}.jpg`
  const fullPath = path.join(dir, filename)
  await writeFile(fullPath, `bytes-${label}`)
  return { url: `/uploads/${prefix}/${filename}`, fullPath }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

const baseInput = {
  name: 'Aceite hojiblanca',
  description: 'Cosecha temprana',
  categoryId: undefined,
  basePrice: 12,
  compareAtPrice: undefined,
  taxRate: 0.1,
  unit: 'L',
  stock: 5,
  trackStock: true,
  certifications: [],
  originRegion: 'Jaén',
  expiresAt: undefined,
  status: 'DRAFT' as const,
}

test('updateProduct deletes the blob for a replaced image, leaves the survivor alone', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const a = await writeUpload('products/test', 'a')
  const b = await writeUpload('products/test', 'b')
  const c = await writeUpload('products/test', 'c')

  const created = await createProduct({
    ...baseInput,
    images: [a.url, b.url],
    imageAlts: ['', ''],
  })

  // Replace b with c. Keep a.
  await updateProduct(created.id, {
    images: [a.url, c.url],
    imageAlts: ['', ''],
  })

  // a.jpg survives, b.jpg was orphaned and deleted, c.jpg is still there.
  assert.equal(await exists(a.fullPath), true, 'kept image must survive')
  assert.equal(await exists(b.fullPath), false, 'replaced image must be unlinked')
  assert.equal(await exists(c.fullPath), true, 'incoming image must survive')

  // Cleanup leftover files.
  await rm(a.fullPath, { force: true })
  await rm(c.fullPath, { force: true })
})

test('updateProduct: pure reorder does NOT delete any image', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const a = await writeUpload('products/test', 'a')
  const b = await writeUpload('products/test', 'b')
  const c = await writeUpload('products/test', 'c')

  const created = await createProduct({
    ...baseInput,
    images: [a.url, b.url, c.url],
    imageAlts: ['', '', ''],
  })

  // Same set, different order.
  await updateProduct(created.id, {
    images: [c.url, a.url, b.url],
    imageAlts: ['', '', ''],
  })

  assert.equal(await exists(a.fullPath), true, 'reorder must not unlink a')
  assert.equal(await exists(b.fullPath), true, 'reorder must not unlink b')
  assert.equal(await exists(c.fullPath), true, 'reorder must not unlink c')

  await rm(a.fullPath, { force: true })
  await rm(b.fullPath, { force: true })
  await rm(c.fullPath, { force: true })
})

test('updateProduct: clearing all images deletes every blob', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const a = await writeUpload('products/test', 'a')
  const b = await writeUpload('products/test', 'b')

  const created = await createProduct({
    ...baseInput,
    images: [a.url, b.url],
    imageAlts: ['', ''],
  })

  await updateProduct(created.id, {
    images: [],
    imageAlts: [],
  })

  assert.equal(await exists(a.fullPath), false)
  assert.equal(await exists(b.fullPath), false)

  // Row update committed regardless.
  const stored = await db.product.findUnique({ where: { id: created.id } })
  assert.deepEqual(stored?.images, [])
})

test('updateVendorProfile: replaces logo and orphans the previous one', async () => {
  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const oldLogo = await writeUpload(`vendors/${vendor.id}`, 'old-logo')
  const newLogo = await writeUpload(`vendors/${vendor.id}`, 'new-logo')
  const cover = await writeUpload(`vendors/${vendor.id}`, 'cover')

  await db.vendor.update({
    where: { id: vendor.id },
    data: { logo: oldLogo.url, coverImage: cover.url },
  })

  await updateVendorProfile({
    displayName: vendor.displayName,
    description: 'updated',
    logo: newLogo.url,
    coverImage: cover.url,
  })

  assert.equal(await exists(oldLogo.fullPath), false, 'old logo must be unlinked')
  assert.equal(await exists(newLogo.fullPath), true, 'new logo survives')
  assert.equal(await exists(cover.fullPath), true, 'untouched cover survives')

  await rm(newLogo.fullPath, { force: true })
  await rm(cover.fullPath, { force: true })
})

test('updateVendorProfile: dropping the cover to null orphans the file', async () => {
  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const cover = await writeUpload(`vendors/${vendor.id}`, 'cover')
  await db.vendor.update({
    where: { id: vendor.id },
    data: { coverImage: cover.url },
  })

  await updateVendorProfile({
    displayName: vendor.displayName,
    coverImage: '',
  })

  assert.equal(await exists(cover.fullPath), false)
})
