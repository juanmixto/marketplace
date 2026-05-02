import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contract test for #1052 (epic #1047).
 *
 * The /api/upload route must keep three invariants for /_next/image
 * prewarm to actually fire:
 *
 *   1. The IMAGE_PREWARM_ENABLED gate is consulted (via the helper,
 *      not an inline string compare — the helper is the unit-tested
 *      surface).
 *   2. The job name passed to enqueue is the canonical constant
 *      exported from the worker module, not a stringly-typed copy
 *      that can drift from the handler registration.
 *   3. The enqueue is fire-and-forget (no `await` on the enqueue
 *      promise) — otherwise a queue stall would block the upload
 *      response, which is the exact failure mode #1052 set out to
 *      avoid.
 *
 * Plain-text grep is fine here; the alternative (parsing the AST) is
 * overkill for a 3-invariant lock.
 */

const ROUTE_PATH = join(process.cwd(), 'src/app/api/upload/route.ts')

test('upload route imports the prewarm helper + job constant', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8')
  assert.match(src, /from '@\/workers\/jobs\/prewarm-image-variants'/)
  assert.match(src, /\bPREWARM_IMAGE_VARIANTS_JOB\b/)
  assert.match(src, /\bisImagePrewarmEnabled\b/)
})

test('upload route gates enqueue on isImagePrewarmEnabled()', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8')
  assert.match(src, /if \(isImagePrewarmEnabled\(\)\)/)
})

test('upload route enqueues fire-and-forget (void prefix, no await)', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8')
  // The enqueue call must be `void enqueue(...)`, never `await
  // enqueue(...)`. Awaiting would block the upload response on a
  // pg-boss round-trip — the bug #1052 explicitly designs around.
  assert.match(src, /void enqueue[\s\S]*?PREWARM_IMAGE_VARIANTS_JOB/)
  assert.doesNotMatch(
    src,
    /await\s+enqueue[\s\S]*?PREWARM_IMAGE_VARIANTS_JOB/,
  )
})
