/**
 * #1050 — `deleteBlob` + `diffRemovedUrls` unit tests.
 *
 * The contract under test:
 *
 *   1. Local mode unlinks the file under public/uploads.
 *   2. Local mode is idempotent (ENOENT = success).
 *   3. Path traversal is rejected (no fs.unlink call).
 *   4. Vercel mode without a token returns a structured failure
 *      (no throw).
 *   5. `diffRemovedUrls` ignores reorder, deduplicates, treats
 *      null/empty as absence.
 *
 * The Vercel happy path is covered in the integration test against
 * the sweep — these features tests stay infra-free.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { deleteBlob, diffRemovedUrls } from '@/lib/blob-storage'

async function setupUploadFixture(): Promise<{ cwd: string; restore: () => void }> {
  // `deleteBlob` resolves local paths against `process.cwd()`. We
  // cannot easily monkey-patch cwd, so we create the fixture
  // RELATIVE to the actual cwd (the repo root) under a temp dir
  // that we'll clean up after the test. Each test uses a unique
  // sub-path so they don't stomp each other under parallel runs.
  const root = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(root, { recursive: true })
  const restore = () => {}
  return { cwd: process.cwd(), restore }
}

test('deleteBlob (local): unlinks an existing file under public/uploads', async () => {
  await setupUploadFixture()
  const key = `__test_delete_${process.pid}_${Date.now()}.txt`
  const fullPath = path.join(process.cwd(), 'public', 'uploads', key)
  await writeFile(fullPath, 'orphan-bytes')
  // Sanity check the fixture wrote.
  assert.equal(await readFile(fullPath, 'utf8'), 'orphan-bytes')

  const result = await deleteBlob(`/uploads/${key}`)
  assert.deepEqual(result, { ok: true, mode: 'local' })

  await assert.rejects(() => readFile(fullPath, 'utf8'), /ENOENT/)
})

test('deleteBlob (local): missing file is treated as success (idempotent)', async () => {
  const result = await deleteBlob(`/uploads/__definitely_does_not_exist_${process.pid}.txt`)
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'local')
})

test('deleteBlob (local): rejects path traversal without unlinking anything', async () => {
  // A canary file *outside* uploads. If the traversal guard fails,
  // the test would unlink it and the next assertion would fail.
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'orphan-test-'))
  const canary = path.join(tmpDir, 'canary.txt')
  await writeFile(canary, 'must-survive')

  // Build a relative path that would, if joined naively, escape
  // public/uploads/ and land on the canary. We use the absolute
  // tmp path's relation to the cwd to compute the right number of
  // `..` segments.
  const relFromUploads = path.relative(
    path.join(process.cwd(), 'public', 'uploads'),
    canary,
  )
  const malicious = `/uploads/${relFromUploads}`
  const result = await deleteBlob(malicious)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.mode, 'local')
    assert.equal(result.errorType, 'path_traversal')
  }

  // Canary still alive.
  assert.equal(await readFile(canary, 'utf8'), 'must-survive')
  await rm(tmpDir, { recursive: true, force: true })
})

test('deleteBlob (vercel): missing token returns structured failure, no throw', async () => {
  const previous = process.env.BLOB_READ_WRITE_TOKEN
  delete process.env.BLOB_READ_WRITE_TOKEN
  try {
    const result = await deleteBlob('https://example.public.blob.vercel-storage.com/foo.jpg')
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.mode, 'vercel')
      assert.equal(result.errorType, 'missing_token')
    }
  } finally {
    if (previous !== undefined) process.env.BLOB_READ_WRITE_TOKEN = previous
  }
})

test('deleteBlob: null/undefined/empty URL is a noop, never throws', async () => {
  assert.deepEqual(await deleteBlob(null), { ok: true, mode: 'noop' })
  assert.deepEqual(await deleteBlob(undefined), { ok: true, mode: 'noop' })
  assert.deepEqual(await deleteBlob(''), { ok: true, mode: 'noop' })
})

// ─── diffRemovedUrls ──────────────────────────────────────────────────────────

test('diffRemovedUrls: removed by replacement', () => {
  const removed = diffRemovedUrls(
    ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg'],
    ['/uploads/a.jpg', '/uploads/c.jpg', '/uploads/d.jpg'],
  )
  assert.deepEqual(removed.sort(), ['/uploads/b.jpg'])
})

test('diffRemovedUrls: pure reorder generates no diff', () => {
  const removed = diffRemovedUrls(
    ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg'],
    ['/uploads/c.jpg', '/uploads/a.jpg', '/uploads/b.jpg'],
  )
  assert.deepEqual(removed, [])
})

test('diffRemovedUrls: dedupes the result when the old set has duplicates', () => {
  const removed = diffRemovedUrls(
    ['/uploads/a.jpg', '/uploads/a.jpg', '/uploads/b.jpg'],
    ['/uploads/c.jpg'],
  )
  assert.deepEqual(removed.sort(), ['/uploads/a.jpg', '/uploads/b.jpg'])
})

test('diffRemovedUrls: null/undefined/empty entries are ignored on both sides', () => {
  const removed = diffRemovedUrls(
    [null, '', '/uploads/keep.jpg', undefined, '/uploads/gone.jpg'],
    [null, '/uploads/keep.jpg'],
  )
  assert.deepEqual(removed, ['/uploads/gone.jpg'])
})

test('diffRemovedUrls: scalar field replacement (vendor logo case)', () => {
  // Vendor.logo + Vendor.coverImage are scalar fields, but we still
  // funnel them through the same helper so the empty-state handling
  // is uniform.
  const removed = diffRemovedUrls(
    ['/uploads/old-logo.jpg', null],
    ['/uploads/new-logo.jpg', '/uploads/new-cover.jpg'],
  )
  assert.deepEqual(removed.sort(), ['/uploads/old-logo.jpg'])
})

test('diffRemovedUrls: removing a single field to null', () => {
  const removed = diffRemovedUrls(
    ['/uploads/old-logo.jpg', '/uploads/old-cover.jpg'],
    ['/uploads/old-logo.jpg', null],
  )
  assert.deepEqual(removed, ['/uploads/old-cover.jpg'])
})
