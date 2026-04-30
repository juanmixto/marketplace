/**
 * Blob storage abstraction (#31).
 *
 * Two backends:
 *
 * - `local`: writes uploads to `public/uploads/` so they're served by Next.js
 *   itself. This is the default in dev and the only backend with no setup.
 *   It is NOT for production — files persist only on the machine that
 *   handled the request, which breaks horizontal scaling and disappears on
 *   container restarts.
 *
 * - `vercel-blob`: uses @vercel/blob when BLOB_READ_WRITE_TOKEN is set.
 *   Stub today: the SDK call is gated behind a runtime import and a clear
 *   error if the package isn't installed yet, so we can land the abstraction
 *   without forcing a new dependency on the team.
 *
 * Adding a third provider (S3, R2) means writing one new function under
 * the same `BlobUploader` shape. Callers should never branch on the
 * provider — they pass bytes in, they get a URL out.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { logger } from '@/lib/logger'

export interface UploadInput {
  /** Buffer of the file bytes. */
  bytes: Buffer
  /** MIME type of the file (already validated by the caller). */
  contentType: string
  /** Original filename — used only to guess an extension; never trusted as the stored name. */
  originalName: string
  /** Optional storage subfolder, e.g. `products/<vendorId>`. */
  prefix?: string
}

export interface UploadResult {
  /** Public URL the client can use directly in <img src> / <Image src>. */
  url: string
  /** The path/key under which the file is stored — opaque to callers. */
  storageKey: string
}

export type StorageProvider = 'local' | 'vercel-blob'

export interface BlobUploader {
  provider: StorageProvider
  upload(input: UploadInput): Promise<UploadResult>
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function buildStorageKey(input: UploadInput): string {
  const ext = EXTENSION_BY_MIME[input.contentType] ?? 'bin'
  const id = randomUUID()
  // Never trust the caller's filename — generate a UUID and keep only the
  // extension we already validated against the magic bytes upstream.
  const filename = `${id}.${ext}`
  return input.prefix ? `${input.prefix}/${filename}` : filename
}

class LocalUploader implements BlobUploader {
  readonly provider = 'local' as const

  async upload(input: UploadInput): Promise<UploadResult> {
    const storageKey = buildStorageKey(input)
    const fullPath = path.join(process.cwd(), 'public', 'uploads', storageKey)
    await mkdir(path.dirname(fullPath), { recursive: true })
    await writeFile(fullPath, input.bytes)
    return {
      url: `/uploads/${storageKey}`,
      storageKey,
    }
  }
}

class VercelBlobUploader implements BlobUploader {
  readonly provider = 'vercel-blob' as const

  constructor(private readonly token: string) {}

  async upload(input: UploadInput): Promise<UploadResult> {
    // The @vercel/blob package is intentionally NOT a hard dependency yet —
    // the team can opt in by `npm install @vercel/blob` and setting
    // BLOB_READ_WRITE_TOKEN. Until then, this branch fails clearly at
    // runtime with no compile-time coupling.
    interface VercelBlobPut {
      (
        path: string,
        body: Buffer,
        opts: { access: 'public'; contentType: string; token: string }
      ): Promise<{ url: string }>
    }
    let put: VercelBlobPut
    try {
      const mod = (await import('@vercel/blob' as string)) as { put: VercelBlobPut }
      put = mod.put
    } catch {
      throw new Error(
        'BLOB_READ_WRITE_TOKEN is set but @vercel/blob is not installed. Run `npm install @vercel/blob` or unset the token to fall back to the local uploader.'
      )
    }

    const storageKey = buildStorageKey(input)
    const blob = await put(storageKey, input.bytes, {
      access: 'public',
      contentType: input.contentType,
      token: this.token,
    })

    return {
      url: blob.url,
      storageKey,
    }
  }
}

let cachedUploader: BlobUploader | undefined

export function getBlobUploader(): BlobUploader {
  if (cachedUploader) return cachedUploader
  const token = process.env.BLOB_READ_WRITE_TOKEN
  cachedUploader = token ? new VercelBlobUploader(token) : new LocalUploader()
  return cachedUploader
}

/** Test/dev helper: clears the cached uploader so env changes take effect. */
export function resetBlobUploaderCache() {
  cachedUploader = undefined
}

// ─── Orphan cleanup (#1050) ───────────────────────────────────────────────────

/**
 * Extracts the host from a URL so we can emit it as a low-cardinality
 * label in metrics. Vercel Blob URLs include a per-request access
 * token in the path, so the URL itself MUST NOT be logged. Falls back
 * to "local" for relative `/uploads/...` paths and "unknown" for
 * anything we cannot parse.
 */
function safeDomainFromUrl(url: string): string {
  if (!url) return 'unknown'
  if (url.startsWith('/')) return 'local'
  try {
    return new URL(url).host
  } catch {
    return 'unknown'
  }
}

/**
 * Resolves a relative `/uploads/<key>` URL to an absolute path under
 * `public/uploads/`, with traversal protection. Returns null when the
 * URL is not a local upload or escapes the upload root.
 */
function resolveLocalUploadPath(url: string): string | null {
  if (!url.startsWith('/uploads/')) return null
  const key = url.slice('/uploads/'.length)
  // Guard against `..` segments and absolute keys. We resolve and
  // verify the resulting path is still inside the upload root.
  const root = path.resolve(process.cwd(), 'public', 'uploads')
  const candidate = path.resolve(root, key)
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep
  if (candidate !== root && !candidate.startsWith(rootWithSep)) {
    return null
  }
  return candidate
}

export type DeleteBlobOutcome =
  | { ok: true; mode: 'vercel' | 'local' | 'noop' }
  | { ok: false; mode: 'vercel' | 'local' | 'unknown'; errorType: string }

/**
 * Deletes a previously-uploaded blob. Idempotent and never throws —
 * "huérfano > update fallido" (see issue #1050). Errors are absorbed
 * so a failure here cannot tumble the parent server action; the
 * nightly sweep is the safety net for missed deletes.
 *
 * Mode is chosen at call time, NOT cached, so a test can flip the env
 * between calls without hitting `resetBlobUploaderCache`. The Vercel
 * SDK (@vercel/blob) is imported dynamically because it is an
 * optional dependency (mirrors the upload path).
 */
export async function deleteBlob(url: string | null | undefined): Promise<DeleteBlobOutcome> {
  if (!url) {
    return { ok: true, mode: 'noop' }
  }
  const domain = safeDomainFromUrl(url)
  const token = process.env.BLOB_READ_WRITE_TOKEN

  // Local/relative uploads → fs.unlink. We branch on the URL shape,
  // not on the env, because a vendor's row in production may still
  // reference a `/uploads/...` URL written before the Vercel switch.
  if (url.startsWith('/uploads/')) {
    const fullPath = resolveLocalUploadPath(url)
    if (!fullPath) {
      logger.warn('photo.cleanup.failed', {
        mode: 'local',
        domain,
        error_type: 'path_traversal',
      })
      return { ok: false, mode: 'local', errorType: 'path_traversal' }
    }
    try {
      await unlink(fullPath)
      logger.info('photo.cleanup.success', { mode: 'local', domain })
      return { ok: true, mode: 'local' }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT') {
        // Idempotent: already gone is success.
        logger.info('photo.cleanup.success', { mode: 'local', domain, alreadyGone: true })
        return { ok: true, mode: 'local' }
      }
      logger.warn('photo.cleanup.failed', {
        mode: 'local',
        domain,
        error_type: code ?? 'unknown',
      })
      return { ok: false, mode: 'local', errorType: code ?? 'unknown' }
    }
  }

  // Absolute http(s) URL. Without a token we cannot call Vercel's
  // del() — emit a warn and bail. This is the case in dev when a
  // database row references a real Vercel URL but the local env is
  // not configured.
  if (!token) {
    logger.warn('photo.cleanup.failed', {
      mode: 'vercel',
      domain,
      error_type: 'missing_token',
    })
    return { ok: false, mode: 'vercel', errorType: 'missing_token' }
  }

  interface VercelBlobDel {
    (url: string | string[], opts: { token: string }): Promise<void>
  }
  let del: VercelBlobDel
  try {
    const mod = (await import('@vercel/blob' as string)) as { del: VercelBlobDel }
    del = mod.del
  } catch {
    logger.warn('photo.cleanup.failed', {
      mode: 'vercel',
      domain,
      error_type: 'package_missing',
    })
    return { ok: false, mode: 'vercel', errorType: 'package_missing' }
  }

  try {
    await del(url, { token })
    logger.info('photo.cleanup.success', { mode: 'vercel', domain })
    return { ok: true, mode: 'vercel' }
  } catch (err: unknown) {
    const errorType = (err as { code?: string; name?: string })?.code
      ?? (err as { name?: string })?.name
      ?? 'unknown'
    logger.warn('photo.cleanup.failed', {
      mode: 'vercel',
      domain,
      error_type: errorType,
    })
    return { ok: false, mode: 'vercel', errorType }
  }
}

/**
 * Returns the URLs in `oldUrls` that are NOT present in `newUrls`.
 * Reorder does NOT count as removal: if a URL stays in the array
 * (any position) it is preserved. Deduplicates the result.
 */
export function diffRemovedUrls(
  oldUrls: ReadonlyArray<string | null | undefined>,
  newUrls: ReadonlyArray<string | null | undefined>,
): string[] {
  const survivors = new Set<string>()
  for (const u of newUrls) {
    if (typeof u === 'string' && u.length > 0) survivors.add(u)
  }
  const removed = new Set<string>()
  for (const u of oldUrls) {
    if (typeof u !== 'string' || u.length === 0) continue
    if (!survivors.has(u)) removed.add(u)
  }
  return Array.from(removed)
}

/**
 * Deletes every URL in `urls` in parallel via `Promise.allSettled`,
 * tagging each call with the source ('product' | 'vendor') for
 * observability. Errors are already absorbed inside `deleteBlob`,
 * so this never rejects. Returning the outcomes lets callers (and
 * tests) inspect what was attempted.
 */
export async function deleteBlobs(
  urls: ReadonlyArray<string>,
  source: 'product' | 'vendor',
): Promise<DeleteBlobOutcome[]> {
  if (urls.length === 0) return []
  const results = await Promise.allSettled(urls.map((u) => deleteBlob(u)))
  const outcomes: DeleteBlobOutcome[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (!r) continue
    if (r.status === 'fulfilled') {
      outcomes.push(r.value)
    } else {
      // deleteBlob never rejects, but defend against the SDK throwing
      // before our try/catch sees it.
      const domain = safeDomainFromUrl(urls[i] ?? '')
      logger.warn('photo.cleanup.failed', {
        mode: 'unknown',
        domain,
        source,
        error_type: 'rejected_promise',
      })
      outcomes.push({ ok: false, mode: 'unknown', errorType: 'rejected_promise' })
    }
  }
  return outcomes
}

/** Test seam: convenience exports for unit tests. */
export const __testing = { resolveLocalUploadPath, safeDomainFromUrl }
