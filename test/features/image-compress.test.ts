import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractExifOrientation,
  formatBytes,
  isSupportedImageInputType,
} from '@/lib/image-compress'

function makeExifOrientationJpeg(orientation: number) {
  const exifPayload = Buffer.from([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x01,
    0x01, 0x12,
    0x00, 0x03,
    0x00, 0x00, 0x00, 0x01,
    0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ])
  const app1Length = exifPayload.length + 2
  return new Uint8Array(Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1, app1Length >> 8, app1Length & 0xff]),
    exifPayload,
    Buffer.from([0xff, 0xd9]),
  ]))
}

test('isSupportedImageInputType accepts browser image formats we can prepare client-side', () => {
  assert.equal(isSupportedImageInputType('image/jpeg'), true)
  assert.equal(isSupportedImageInputType('image/webp'), true)
  assert.equal(isSupportedImageInputType('image/heic'), true)
  assert.equal(isSupportedImageInputType('image/heif-sequence'), true)
})

test('isSupportedImageInputType rejects formats we do not process in this upload flow', () => {
  assert.equal(isSupportedImageInputType('image/gif'), false)
  assert.equal(isSupportedImageInputType('image/svg+xml'), false)
  assert.equal(isSupportedImageInputType('application/pdf'), false)
  assert.equal(isSupportedImageInputType(''), false)
})

test('extractExifOrientation reads the JPEG EXIF orientation tag', () => {
  assert.equal(extractExifOrientation(makeExifOrientationJpeg(6)), 6)
})

test('extractExifOrientation falls back to 1 when the buffer has no EXIF orientation', () => {
  assert.equal(extractExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), 1)
  assert.equal(extractExifOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 1)
})

test('formatBytes returns compact human-readable sizes for upload summaries', () => {
  assert.equal(formatBytes(999), '999 B')
  assert.equal(formatBytes(4_200), '4 KB')
  assert.equal(formatBytes(1_250_000), '1.3 MB')
})
