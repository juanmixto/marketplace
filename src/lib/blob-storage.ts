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
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

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
