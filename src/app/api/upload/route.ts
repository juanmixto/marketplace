import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { isAdminRole, isVendor } from '@/lib/roles'
import { db } from '@/lib/db'
import { getBlobUploader } from '@/lib/blob-storage'
import {
  MAX_UPLOAD_BYTES,
  UploadValidationError,
  validateImageUpload,
} from '@/lib/upload-validation'

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

  return NextResponse.json(result, { status: 201 })
}
