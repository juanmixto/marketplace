/**
 * Upload validation (#31).
 *
 * Runs BEFORE we hand bytes to the blob storage layer:
 *
 *  - file is one of jpeg / png / webp
 *  - declared MIME type matches the magic bytes (defense against the
 *    classic "rename evil.exe to image.jpg" attack)
 *  - file size <= MAX_UPLOAD_BYTES
 *
 * The functions are pure: they never touch the disk or the network, so
 * they're trivial to unit-test.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5 MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number]

export class UploadValidationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'too-large'
      | 'unsupported-type'
      | 'magic-bytes-mismatch'
      | 'empty-file'
  ) {
    super(message)
    this.name = 'UploadValidationError'
  }
}

/**
 * Returns the MIME type detected from the first bytes of the file, or null
 * if the file is not one of our allowed image types. Reads up to the first
 * 12 bytes — enough to disambiguate jpeg / png / webp.
 */
export function detectImageMimeType(bytes: Buffer): AllowedImageType | null {
  if (bytes.length < 4) return null

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }

  // JPEG: starts FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  // WEBP: "RIFF" .... "WEBP" — needs at least 12 bytes.
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  return null
}

export interface ValidatedUpload {
  bytes: Buffer
  contentType: AllowedImageType
}

/**
 * Single chokepoint that turns an arbitrary File / Buffer into a known-safe
 * upload. Throws `UploadValidationError` with a code so the API route can
 * map each failure mode to a stable HTTP response.
 */
export function validateImageUpload(
  bytes: Buffer,
  declaredContentType: string | null | undefined
): ValidatedUpload {
  if (bytes.length === 0) {
    throw new UploadValidationError('Empty file', 'empty-file')
  }

  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(
      `File too large (${bytes.length} bytes; max ${MAX_UPLOAD_BYTES})`,
      'too-large'
    )
  }

  const detected = detectImageMimeType(bytes)
  if (!detected) {
    throw new UploadValidationError(
      'File is not a supported image format (jpeg, png, webp)',
      'unsupported-type'
    )
  }

  // If the client sent a content-type, it must match what we actually saw
  // in the bytes. We trust the magic-bytes detection over the header.
  if (declaredContentType && declaredContentType !== detected) {
    throw new UploadValidationError(
      `Declared content-type (${declaredContentType}) does not match file contents (${detected})`,
      'magic-bytes-mismatch'
    )
  }

  return { bytes, contentType: detected }
}
