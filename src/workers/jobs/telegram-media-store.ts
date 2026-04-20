import { Buffer } from 'node:buffer'
import { getBlobUploader } from '@/lib/blob-storage'
import { MediaOversizeError, type MediaStoreFn } from '@/domains/ingestion'

/**
 * Default media-store implementation used by the production worker.
 *
 * Reads the provider's async-iterable chunk by chunk, enforcing the
 * size cap on the running total (the provider's `sizeHintBytes` is
 * a pre-check in the handler, but we re-assert here because Telegram
 * sometimes under-reports media size). On overflow we abort the
 * iterator so bytes stop flowing through the pipe.
 *
 * Once the buffer is complete we hand it to the existing
 * `BlobUploader` abstraction; that lives in `src/lib/blob-storage.ts`
 * and chooses `local` or `vercel-blob` based on env. Callers never
 * see either — they just get back a `blobKey`.
 */

export const defaultMediaStore: MediaStoreFn = async ({
  fileUniqueId,
  stream,
  mimeType,
  sizeHintBytes: _sizeHintBytes,
  maxBytes,
}) => {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of stream) {
    total += chunk.byteLength
    if (total > maxBytes) {
      throw new MediaOversizeError(maxBytes, total)
    }
    chunks.push(chunk)
  }

  const bytes = Buffer.concat(chunks, total)
  const uploader = getBlobUploader()
  const effectiveContentType = mimeType ?? 'application/octet-stream'
  const originalName = `telegram-${fileUniqueId}.bin`
  const result = await uploader.upload({
    bytes,
    contentType: effectiveContentType,
    originalName,
    prefix: 'ingestion/telegram',
  })

  return {
    blobKey: result.storageKey,
    sizeBytes: total,
    mimeType: effectiveContentType,
  }
}
