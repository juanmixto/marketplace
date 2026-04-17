import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(relative: string): string {
  return readFileSync(new URL(`../../${relative}`, import.meta.url).pathname, 'utf8')
}

test('image compression helper keeps the mobile upload contract in one place', () => {
  const source = read('src/lib/image-compress.ts')
  assert.match(
    source,
    /export const IMAGE_INPUT_ACCEPT =[\s\S]*image\/heic/,
    'image-compress.ts must keep HEIC/HEIF in IMAGE_INPUT_ACCEPT',
  )
  assert.match(
    source,
    /product:\s*\{\s*maxDimension:\s*1600,\s*quality:\s*0\.82,\s*targetBytes:\s*1_600_000\s*\}/,
    'product preset must keep the current 1600px / 0.82 / 1.6MB contract',
  )
  assert.match(
    source,
    /cover:\s*\{\s*maxDimension:\s*1600,\s*quality:\s*0\.8,\s*targetBytes:\s*1_400_000\s*\}/,
    'cover preset must keep the current 1600px / 0.8 / 1.4MB contract',
  )
})

test('product image uploader keeps optimized preview + progress states', () => {
  const source = read('src/components/vendor/ImageUploader.tsx')
  assert.match(
    source,
    /prepareImageForUpload\(rawFile,\s*'product'\)/,
    'ImageUploader must prepare product images before upload',
  )
  assert.match(
    source,
    /URL\.createObjectURL\(file\)/,
    'ImageUploader must show a preview from the optimized file',
  )
  assert.match(
    source,
    /vendor\.upload\.compressing/,
    'ImageUploader must expose localized progress for optimization',
  )
  assert.match(
    source,
    /vendor\.upload\.uploading/,
    'ImageUploader must expose localized progress for upload',
  )
  assert.match(
    source,
    /vendor\.upload\.heicUnsupported/,
    'ImageUploader must surface the HEIC-specific fallback message',
  )
  assert.match(
    source,
    /useMobileUploadDevice\(\)/,
    'ImageUploader must detect mobile upload devices to tailor the picker UX',
  )
  assert.match(
    source,
    /capture="environment"/,
    'ImageUploader must expose a direct camera path for mobile devices',
  )
  assert.match(
    source,
    /\{isMobileUploadDevice && \(/,
    'ImageUploader must only mount the camera capture input on mobile devices',
  )
})

test('vendor hero uploader keeps the same optimized-before-upload contract', () => {
  const source = read('src/components/vendor/VendorHeroUpload.tsx')
  assert.match(
    source,
    /prepareImageForUpload\(rawFile,\s*slot === 'cover' \? 'cover' : 'avatar'\)/,
    'VendorHeroUpload must prepare cover/logo images before upload',
  )
  assert.match(
    source,
    /vendor\.heroUpload\.optimizedSummary/,
    'VendorHeroUpload must display the optimization summary',
  )
  assert.match(
    source,
    /vendor\.heroUpload\.heicUnsupported/,
    'VendorHeroUpload must surface the HEIC-specific fallback message',
  )
  assert.match(
    source,
    /useMobileUploadDevice\(\)/,
    'VendorHeroUpload must detect mobile upload devices before exposing camera actions',
  )
  assert.match(
    source,
    /capture="environment"/,
    'VendorHeroUpload must expose direct camera capture only through a dedicated mobile input',
  )
  assert.match(
    source,
    /\{isMobileUploadDevice && \(/,
    'VendorHeroUpload must only mount dedicated camera inputs on mobile devices',
  )
})
