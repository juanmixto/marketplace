import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPRESS_PRESETS,
  ImageCompressionError,
  compressImage,
  readExifOrientationFromBytes,
} from '@/lib/image-compress'

test('image compress presets keep the expected upload targets', () => {
  assert.equal(COMPRESS_PRESETS.product.maxDimension, 1600)
  assert.equal(COMPRESS_PRESETS.product.quality, 0.82)
  assert.equal(COMPRESS_PRESETS.product.targetBytes, 2_500_000)

  assert.equal(COMPRESS_PRESETS.cover.maxDimension, 1600)
  assert.equal(COMPRESS_PRESETS.cover.quality, 0.8)
  assert.equal(COMPRESS_PRESETS.cover.targetBytes, 1_500_000)

  assert.equal(COMPRESS_PRESETS.avatar.maxDimension, 512)
  assert.equal(COMPRESS_PRESETS.avatar.quality, 0.82)
  assert.equal(COMPRESS_PRESETS.avatar.targetBytes, 400_000)
})

test('compressImage returns the original file on the server', async () => {
  const input = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', {
    type: 'image/jpeg',
    lastModified: 1700000000000,
  })

  const output = await compressImage(input, 'product')

  assert.equal(output, input)
})

test('compressImage returns the original file for non-image inputs', async () => {
  const input = new File([new Uint8Array([1, 2, 3])], 'notes.txt', {
    type: 'text/plain',
    lastModified: 1700000000000,
  })

  const output = await compressImage(input, 'product')

  assert.equal(output, input)
})

test('readExifOrientationFromBytes reads the orientation tag from a JPEG EXIF block', () => {
  const bytes = Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xe1, 0x00, 0x22, // APP1 length = 34 bytes
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // Exif\0\0
    0x49, 0x49, 0x2a, 0x00, // TIFF header (little-endian)
    0x08, 0x00, 0x00, 0x00, // IFD0 offset
    0x01, 0x00, // 1 entry
    0x12, 0x01, // Orientation tag
    0x03, 0x00, // SHORT
    0x01, 0x00, 0x00, 0x00, // count = 1
    0x06, 0x00, 0x00, 0x00, // value = 6
    0x00, 0x00, 0x00, 0x00, // next IFD offset
    0xff, 0xd9, // EOI
  ])

  assert.equal(readExifOrientationFromBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), 6)
})

test('ImageCompressionError exposes a stable code for the UI fallback', () => {
  const error = new ImageCompressionError('heic-unsupported', 'HEIC/HEIF images are not supported by this browser')

  assert.equal(error.code, 'heic-unsupported')
  assert.equal(error.name, 'ImageCompressionError')
})
