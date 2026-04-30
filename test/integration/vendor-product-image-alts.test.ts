/**
 * #1049 — alt text persistence and length-invariant.
 *
 * The contract under test:
 *
 *   1. createProduct rejects when `images.length !== imageAlts.length`.
 *   2. createProduct persists the alts in lockstep with images.
 *   3. updateProduct propagates a new alts array as-is.
 *   4. updateProduct touching only `images` keeps the previous alts
 *      where indices line up and pads with '' for newly added slots.
 *
 * Together these exercise the server-side normalization done in
 * `normalizeImageAlts` / `assertImageAltsInvariant` in
 * src/domains/vendors/actions.ts. Running against Postgres guards
 * the column type as well — Postgres rejects a mismatched length
 * on `imageAlts: TEXT[]` if we ever drift from the contract at the
 * DB level.
 */

import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createProduct, updateProduct } from '@/domains/vendors/actions'
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

const baseInput = {
  name: 'Miel de tomillo',
  description: 'Cosecha de primavera',
  categoryId: undefined,
  basePrice: 7.5,
  compareAtPrice: undefined,
  taxRate: 0.1,
  unit: 'kg',
  stock: 4,
  trackStock: true,
  certifications: [],
  originRegion: 'Aragón',
  expiresAt: undefined,
  status: 'DRAFT' as const,
}

test('createProduct rejects when imageAlts length does not match images', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  await assert.rejects(
    () =>
      createProduct({
        ...baseInput,
        images: ['/uploads/products/v/a.jpg', '/uploads/products/v/b.jpg'],
        imageAlts: ['solo una'],
      }),
    /imageAlts.*images/i,
    'two images + one alt should fail the invariant',
  )
})

test('createProduct persists imageAlts in lockstep with images', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const created = await createProduct({
    ...baseInput,
    images: ['/uploads/products/v/a.jpg', '/uploads/products/v/b.jpg'],
    imageAlts: ['Bote de miel sobre madera', ''],
  })

  const stored = await db.product.findUnique({ where: { id: created.id } })
  assert.deepEqual(stored?.images, ['/uploads/products/v/a.jpg', '/uploads/products/v/b.jpg'])
  assert.deepEqual(stored?.imageAlts, ['Bote de miel sobre madera', ''])
})

test('createProduct synthesizes empty alts when caller omits imageAlts', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  // Cast to bypass the TS-side requirement — exercising the runtime
  // path used by callers that haven't been updated yet (legacy
  // ingestion publish, older clients).
  const created = await createProduct({
    ...baseInput,
    images: ['/uploads/products/v/legacy.jpg'],
  } as never)

  const stored = await db.product.findUnique({ where: { id: created.id } })
  assert.deepEqual(stored?.imageAlts, [''])
})

test('updateProduct rejects mismatched imageAlts in the same payload', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const created = await createProduct({
    ...baseInput,
    images: ['/uploads/products/v/a.jpg'],
    imageAlts: ['original'],
  })

  await assert.rejects(
    () =>
      updateProduct(created.id, {
        images: ['/uploads/products/v/a.jpg', '/uploads/products/v/b.jpg'],
        imageAlts: ['solo uno'],
      }),
    /imageAlts.*images/i,
  )
})

test('updateProduct propagates a new imageAlts array as-is', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const created = await createProduct({
    ...baseInput,
    images: ['/uploads/products/v/a.jpg', '/uploads/products/v/b.jpg'],
    imageAlts: ['', ''],
  })

  await updateProduct(created.id, {
    images: ['/uploads/products/v/a.jpg', '/uploads/products/v/b.jpg'],
    imageAlts: ['Tomate ramillete', 'Tomate corazón de buey'],
  })

  const stored = await db.product.findUnique({ where: { id: created.id } })
  assert.deepEqual(stored?.imageAlts, ['Tomate ramillete', 'Tomate corazón de buey'])
})

test('updateProduct preserves prior alts when only images change', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const created = await createProduct({
    ...baseInput,
    images: ['/uploads/products/v/a.jpg', '/uploads/products/v/b.jpg'],
    imageAlts: ['primera', 'segunda'],
  })

  // Append a new image without sending imageAlts — server should
  // pad with '' for the new slot, keep the existing alts intact.
  await updateProduct(created.id, {
    images: [
      '/uploads/products/v/a.jpg',
      '/uploads/products/v/b.jpg',
      '/uploads/products/v/c.jpg',
    ],
  })

  const stored = await db.product.findUnique({ where: { id: created.id } })
  assert.deepEqual(stored?.imageAlts, ['primera', 'segunda', ''])
})
