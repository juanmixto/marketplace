import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { getBlobUploader } from '@/lib/blob-storage'
import { checkRateLimit } from '@/lib/ratelimit'
import {
  MAX_UPLOAD_BYTES,
  UploadValidationError,
  validateImageUpload,
} from '@/lib/upload-validation'

// Buyers can attach photos to an incident. /api/upload is gated to
// VENDOR/ADMIN, so a separate endpoint exists here with the buyer-side
// rate-limit bucket and a per-user storage prefix. The validation chain
// (magic bytes, ≤5 MB, jpeg/png/webp) is identical.
const UPLOAD_LIMIT = 30
const UPLOAD_WINDOW_SECONDS = 600

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado', code: 'unauthorized' }, { status: 401 })
  }

  const rateLimit = await checkRateLimit(
    'incident-upload',
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

  const uploader = getBlobUploader()
  const result = await uploader.upload({
    bytes: validated.bytes,
    contentType: validated.contentType,
    originalName: file.name,
    prefix: `incidents/${session.user.id}`,
  })

  return NextResponse.json(result, { status: 201 })
}
