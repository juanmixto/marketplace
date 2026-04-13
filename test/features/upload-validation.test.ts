import test from 'node:test'
import assert from 'node:assert/strict'
import {
  detectImageMimeType,
  MAX_UPLOAD_BYTES,
  UploadValidationError,
  validateImageUpload,
} from '@/lib/upload-validation'

// ─── magic bytes for the three formats we accept ────────────────────────────

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
// "RIFF" .... "WEBP"
const WEBP_HEADER = Buffer.from([
  0x52, 0x49, 0x46, 0x46,
  0x00, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x4c,
])

test('detectImageMimeType recognizes PNG', () => {
  assert.equal(detectImageMimeType(PNG_HEADER), 'image/png')
})

test('detectImageMimeType recognizes JPEG', () => {
  assert.equal(detectImageMimeType(JPEG_HEADER), 'image/jpeg')
})

test('detectImageMimeType recognizes WEBP', () => {
  assert.equal(detectImageMimeType(WEBP_HEADER), 'image/webp')
})

test('detectImageMimeType returns null for an unrecognized header (e.g. PDF)', () => {
  // PDF magic bytes: 25 50 44 46 ("%PDF")
  const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
  assert.equal(detectImageMimeType(pdf), null)
})

test('detectImageMimeType returns null for a buffer too short to identify', () => {
  assert.equal(detectImageMimeType(Buffer.from([0xff])), null)
})

test('validateImageUpload accepts a real PNG and trusts the magic bytes over the MIME type', () => {
  const result = validateImageUpload(PNG_HEADER, 'image/png')
  assert.equal(result.contentType, 'image/png')
  assert.equal(result.bytes.length, PNG_HEADER.length)
})

test('validateImageUpload accepts an image when no declared MIME type is provided', () => {
  // Some clients omit Content-Type; we should still accept the file based
  // purely on the magic bytes.
  const result = validateImageUpload(JPEG_HEADER, null)
  assert.equal(result.contentType, 'image/jpeg')
})

test('validateImageUpload rejects a file with mismatched magic bytes vs declared type', () => {
  // A file claiming to be image/png but whose bytes are a JPEG header.
  // This is the classic "renamed evil.exe" attack shape — we must reject.
  assert.throws(
    () => validateImageUpload(JPEG_HEADER, 'image/png'),
    (error: unknown) =>
      error instanceof UploadValidationError && error.code === 'magic-bytes-mismatch'
  )
})

test('validateImageUpload rejects an unsupported image format', () => {
  // BMP is a real image format but not in our allow list. Must fail with
  // unsupported-type, not slip through because "it looks like an image".
  const bmp = Buffer.from([0x42, 0x4d, 0x36, 0x00, 0x00, 0x00, 0x00, 0x00])
  assert.throws(
    () => validateImageUpload(bmp, 'image/bmp'),
    (error: unknown) =>
      error instanceof UploadValidationError && error.code === 'unsupported-type'
  )
})

test('validateImageUpload rejects an empty buffer', () => {
  assert.throws(
    () => validateImageUpload(Buffer.alloc(0), 'image/png'),
    (error: unknown) =>
      error instanceof UploadValidationError && error.code === 'empty-file'
  )
})

test('validateImageUpload rejects a file larger than MAX_UPLOAD_BYTES', () => {
  // Build a buffer that starts with a valid PNG header but is too long.
  const huge = Buffer.alloc(MAX_UPLOAD_BYTES + 1)
  PNG_HEADER.copy(huge, 0)
  assert.throws(
    () => validateImageUpload(huge, 'image/png'),
    (error: unknown) =>
      error instanceof UploadValidationError && error.code === 'too-large'
  )
})

test('validateImageUpload accepts a file exactly at MAX_UPLOAD_BYTES (the boundary is inclusive)', () => {
  const atLimit = Buffer.alloc(MAX_UPLOAD_BYTES)
  PNG_HEADER.copy(atLimit, 0)
  // Should not throw — exactly at the limit is fine.
  const result = validateImageUpload(atLimit, 'image/png')
  assert.equal(result.contentType, 'image/png')
})
