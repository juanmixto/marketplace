import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { isAdminRole, isVendor } from '@/lib/roles'
import { db } from '@/lib/db'
import { getBlobUploader } from '@/lib/blob-storage'
import { checkRateLimit } from '@/lib/ratelimit'
import { enqueue } from '@/lib/queue'
import { logger } from '@/lib/logger'
import {
  MAX_UPLOAD_BYTES,
  UploadValidationError,
  validateImageUpload,
} from '@/lib/upload-validation'
import {
  PREWARM_IMAGE_VARIANTS_JOB,
  isImagePrewarmEnabled,
  type PrewarmImageVariantsJobData,
} from '@/workers/jobs/prewarm-image-variants'

// Per-user upload throttle (#539). 50 uploads per 10-minute window is
// generous for a human editor but cuts off a compromised vendor token
// that loops uploads to drain blob-storage quota or fill local disk.
const UPLOAD_LIMIT = 50
const UPLOAD_WINDOW_SECONDS = 600

/**
 * POST /api/upload  — vendor / admin image upload (#31).
 *
 * Body: multipart/form-data with a single `file` field.
 *
 * Auth: VENDOR or ADMIN role. Vendors have their uploads stored under a
 * per-vendor prefix so a later cleanup / quota check can scope to them.
 *
 * Validation (see lib/upload-validation.ts):
 *   - jpeg / png / webp only
 *   - magic-bytes match the declared content-type
 *   - <= 5 MB
 *
 * Storage (see lib/blob-storage.ts): swapped via env. Local in dev, Vercel
 * Blob if BLOB_READ_WRITE_TOKEN is set, S3/R2 if/when we add a third
 * provider — callers don't need to know.
 *
 * Response: { url, storageKey } on success, or
 *           { error, code } with HTTP 4xx on validation failure.
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado', code: 'unauthorized' }, { status: 401 })
  }

  const role = session.user.role
  if (!isVendor(role) && !isAdminRole(role)) {
    return NextResponse.json({ error: 'No autorizado', code: 'forbidden' }, { status: 403 })
  }

  const rateLimit = await checkRateLimit(
    'upload',
    session.user.id,
    UPLOAD_LIMIT,
    UPLOAD_WINDOW_SECONDS,
    { failClosed: true }
  )
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: rateLimit.message, code: 'rate-limited' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
          'X-RateLimit-Limit': String(UPLOAD_LIMIT),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimit.resetAt.toString(),
        },
      }
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Body must be multipart/form-data', code: 'bad-request' },
      { status: 400 }
    )
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Missing `file` field', code: 'bad-request' },
      { status: 400 }
    )
  }

  // Cheap pre-check on the declared length so we don't even buffer a
  // gigabyte upload before rejecting it. The real check happens after the
  // buffer below, this is just the optimistic fast-fail.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_UPLOAD_BYTES} bytes`, code: 'too-large' },
      { status: 413 }
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  let validated
  try {
    validated = validateImageUpload(bytes, file.type || null)
  } catch (error) {
    if (error instanceof UploadValidationError) {
      const status = error.code === 'too-large' ? 413 : 400
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    throw error
  }

  // Vendors get a per-vendor prefix so their uploads are isolated.
  // Admins write to a generic admin/ prefix; we don't expect heavy admin
  // traffic and there's no per-admin partitioning to do.
  let prefix: string
  if (isVendor(role)) {
    const vendor = await db.vendor.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!vendor) {
      return NextResponse.json(
        { error: 'Vendor profile not found for this user', code: 'forbidden' },
        { status: 403 }
      )
    }
    prefix = `products/${vendor.id}`
  } else {
    prefix = 'admin'
  }

  const uploader = getBlobUploader()
  const result = await uploader.upload({
    bytes: validated.bytes,
    contentType: validated.contentType,
    originalName: file.name,
    prefix,
  })

  // #1052: prewarm /_next/image variants for the most common
  // (width, format) pairs so the first buyer to load this product
  // doesn't pay the encode latency. Fire-and-forget — enqueue must
  // never block the upload response. If the queue is unreachable we
  // log and move on; the variants will still be generated lazily on
  // first real client request, exactly like before #1052.
  if (isImagePrewarmEnabled()) {
    const payload: PrewarmImageVariantsJobData = { url: result.url }
    void enqueue<Record<string, unknown>>(
      PREWARM_IMAGE_VARIANTS_JOB,
      payload as unknown as Record<string, unknown>,
      // Idempotent on URL: if a re-upload happens to dedupe to the
      // same blob URL within a short window, don't pile up duplicate
      // jobs.
      { singletonKey: `prewarm:${result.url}`, retryLimit: 0 },
    )
      .then((jobId) => {
        logger.info('photo.prewarm.queued', { url: result.url, jobId })
      })
      .catch((err) => {
        logger.warn('photo.prewarm.enqueue_failed', {
          url: result.url,
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }

  return NextResponse.json(result, { status: 201 })
}
