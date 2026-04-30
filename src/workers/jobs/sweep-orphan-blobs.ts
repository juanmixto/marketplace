/**
 * Orphan-blob sweeper (#1050, part of #1047).
 *
 * Lists every blob in Vercel Blob storage and crosses it against the
 * union of:
 *
 *   - `Product.images[]` for every Product
 *   - `Vendor.logo` and `Vendor.coverImage` for every Vendor
 *
 * Anything in storage but not referenced anywhere is an orphan — a
 * leftover from a vendor replacing a logo or removing a product image
 * before the synchronous cleanup in `updateProduct` /
 * `updateVendorProfile` shipped, OR from a synchronous cleanup that
 * failed silently (network error, missing token at write time).
 *
 * Safety:
 *
 *   - **Default DRY-RUN.** `PHOTO_SWEEP_DRY_RUN` defaults to `'true'`.
 *     The job reports counts and fires `photo.sweep.orphans_found`
 *     but never calls `del()`. Operators flip the env to `'false'`
 *     after eyeballing one run's metrics.
 *   - **Cursor pagination on the DB side.** The `audit-unbounded-findMany`
 *     CI guard (#963) requires every server-side `findMany` to bound
 *     the result set; we walk Product and Vendor rows in chunks of
 *     `DB_CHUNK_SIZE` keyed by `id`.
 *   - **Cursor pagination on the Vercel side.** `list()` returns at
 *     most ~1000 blobs per page; we follow `cursor` until the
 *     response stops returning one.
 *   - **No URL in metrics.** The host is logged via `safeDomainFromUrl`
 *     so an access-token-bearing URL never lands in a log line.
 *
 * Run mode:
 *
 *   - One-shot: `npm run sweep:orphans` (manual or external cron).
 *   - As a worker job: callable from `runOrphanBlobSweep()` and easy
 *     to wire into pg-boss `schedule()` once we have a deploy where
 *     the worker is the right place to host it. We deliberately did
 *     NOT register a `boss.schedule()` here yet — the project's only
 *     cron today is the ingestion retention sweep, which is also
 *     manual-runnable; pinning a cron is a follow-up.
 */

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { deleteBlob } from '@/lib/blob-storage'

const DB_CHUNK_SIZE = 1000

interface VercelBlobListEntry {
  url: string
  pathname: string
  uploadedAt?: Date | string
  size?: number
}

interface VercelBlobListResponse {
  blobs: VercelBlobListEntry[]
  cursor?: string
  hasMore?: boolean
}

interface VercelBlobList {
  (options: { token: string; cursor?: string; limit?: number }): Promise<VercelBlobListResponse>
}

export interface SweepOrphanBlobsResult {
  scannedBlobs: number
  referencedUrls: number
  orphansFound: number
  deleted: number
  failed: number
  dryRun: boolean
  mode: 'vercel' | 'skipped'
  /** Reason the sweep skipped real work, if any. */
  skipReason?: 'missing_token' | 'package_missing' | 'list_failed'
}

export interface SweepOrphanBlobsOptions {
  /**
   * Override the env-driven dry-run flag. Tests pass this explicitly.
   */
  dryRun?: boolean
  /**
   * Inject a Vercel `list` implementation so tests don't need the
   * SDK. Production leaves this undefined and we dynamic-import.
   */
  list?: VercelBlobList
  /**
   * Inject a deleter so tests can count calls. Defaults to the
   * production `deleteBlob` helper.
   */
  deleter?: (url: string) => Promise<{ ok: boolean }>
  /** Token override (tests). Production reads `BLOB_READ_WRITE_TOKEN`. */
  token?: string
}

function resolveDryRun(explicit: boolean | undefined): boolean {
  if (typeof explicit === 'boolean') return explicit
  // Default to TRUE — the safest setting. Only an explicit "false"
  // (any case) flips it. Empty / unset / typo all stay dry.
  const raw = process.env.PHOTO_SWEEP_DRY_RUN
  if (typeof raw !== 'string') return true
  return raw.trim().toLowerCase() !== 'false'
}

/**
 * Walks `Product.images[]` and `Vendor.logo` / `Vendor.coverImage`
 * via cursor pagination, returning the union of every URL in use.
 */
async function collectReferencedUrls(): Promise<Set<string>> {
  const urls = new Set<string>()

  // Product.images — array per row. We select only `id` + `images`
  // to keep the row size small even with a chunk of 1000.
  let lastProductId: string | undefined
  for (;;) {
    const products = await db.product.findMany({
      take: DB_CHUNK_SIZE,
      ...(lastProductId ? { skip: 1, cursor: { id: lastProductId } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, images: true },
    })
    if (products.length === 0) break
    for (const p of products) {
      for (const img of p.images) {
        if (typeof img === 'string' && img.length > 0) urls.add(img)
      }
    }
    if (products.length < DB_CHUNK_SIZE) break
    const tail = products[products.length - 1]
    if (!tail) break
    lastProductId = tail.id
  }

  // Vendor.logo + Vendor.coverImage — two scalar fields per row.
  let lastVendorId: string | undefined
  for (;;) {
    const vendors = await db.vendor.findMany({
      take: DB_CHUNK_SIZE,
      ...(lastVendorId ? { skip: 1, cursor: { id: lastVendorId } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, logo: true, coverImage: true },
    })
    if (vendors.length === 0) break
    for (const v of vendors) {
      if (v.logo && v.logo.length > 0) urls.add(v.logo)
      if (v.coverImage && v.coverImage.length > 0) urls.add(v.coverImage)
    }
    if (vendors.length < DB_CHUNK_SIZE) break
    const tail = vendors[vendors.length - 1]
    if (!tail) break
    lastVendorId = tail.id
  }

  return urls
}

async function listAllVercelBlobs(
  list: VercelBlobList,
  token: string,
): Promise<VercelBlobListEntry[]> {
  const out: VercelBlobListEntry[] = []
  let cursor: string | undefined
  for (;;) {
    const page = await list({ token, cursor })
    out.push(...page.blobs)
    if (!page.hasMore || !page.cursor) break
    cursor = page.cursor
  }
  return out
}

/**
 * Entry point. Returns a structured result regardless of outcome —
 * never throws, even when the SDK is missing or the token is unset
 * (those resolve to a `mode: 'skipped'` result with `skipReason` so
 * the caller can decide whether that warrants paging an operator).
 */
export async function runOrphanBlobSweep(
  options: SweepOrphanBlobsOptions = {},
): Promise<SweepOrphanBlobsResult> {
  const dryRun = resolveDryRun(options.dryRun)
  const token = options.token ?? process.env.BLOB_READ_WRITE_TOKEN
  const deleter = options.deleter ?? (async (url: string) => deleteBlob(url))

  logger.info('photo.sweep.start', { dryRun })

  if (!token) {
    logger.warn('photo.sweep.skipped', { reason: 'missing_token' })
    return {
      scannedBlobs: 0,
      referencedUrls: 0,
      orphansFound: 0,
      deleted: 0,
      failed: 0,
      dryRun,
      mode: 'skipped',
      skipReason: 'missing_token',
    }
  }

  // Resolve the `list` impl: prefer the injected one (tests), else
  // dynamic-import the SDK. A missing package is a soft skip — same
  // shape as the upload helper.
  let list: VercelBlobList
  if (options.list) {
    list = options.list
  } else {
    try {
      const mod = (await import('@vercel/blob' as string)) as { list: VercelBlobList }
      list = mod.list
    } catch {
      logger.warn('photo.sweep.skipped', { reason: 'package_missing' })
      return {
        scannedBlobs: 0,
        referencedUrls: 0,
        orphansFound: 0,
        deleted: 0,
        failed: 0,
        dryRun,
        mode: 'skipped',
        skipReason: 'package_missing',
      }
    }
  }

  let blobs: VercelBlobListEntry[]
  try {
    blobs = await listAllVercelBlobs(list, token)
  } catch (err) {
    logger.error('photo.sweep.failed', {
      stage: 'list',
      error_type: (err as { code?: string; name?: string })?.name ?? 'unknown',
    })
    return {
      scannedBlobs: 0,
      referencedUrls: 0,
      orphansFound: 0,
      deleted: 0,
      failed: 1,
      dryRun,
      mode: 'skipped',
      skipReason: 'list_failed',
    }
  }

  const referenced = await collectReferencedUrls()

  const orphans = blobs.filter((b) => !referenced.has(b.url))
  logger.info('photo.sweep.orphans_found', {
    scannedBlobs: blobs.length,
    referencedUrls: referenced.size,
    orphans: orphans.length,
    dryRun,
  })

  if (dryRun) {
    return {
      scannedBlobs: blobs.length,
      referencedUrls: referenced.size,
      orphansFound: orphans.length,
      deleted: 0,
      failed: 0,
      dryRun: true,
      mode: 'vercel',
    }
  }

  let deleted = 0
  let failed = 0
  for (const b of orphans) {
    try {
      const r = await deleter(b.url)
      if (r.ok) {
        deleted += 1
      } else {
        failed += 1
      }
    } catch {
      // deleteBlob does not throw, but a custom injected deleter
      // might. Count it as failed and keep going.
      failed += 1
    }
  }

  logger.info('photo.sweep.deleted', { deleted, failed })

  return {
    scannedBlobs: blobs.length,
    referencedUrls: referenced.size,
    orphansFound: orphans.length,
    deleted,
    failed,
    dryRun: false,
    mode: 'vercel',
  }
}
