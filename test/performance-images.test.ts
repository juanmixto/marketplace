import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('server-side product surfaces use next/image instead of SafeImage', () => {
  const card = readSource('../src/components/catalog/ProductCard.tsx')
  const gallery = readSource('../src/components/catalog/ProductImageGallery.tsx')

  assert.match(card, /import Image from 'next\/image'/)
  assert.match(gallery, /import Image from 'next\/image'/)
  assert.doesNotMatch(card, /SafeImage/)
  assert.doesNotMatch(gallery, /SafeImage/)
})

test('demo catalog data uses curated product artwork instead of random mismatched photos', () => {
  const queries = readSource('../src/domains/catalog/queries.ts')
  const seed = readSource('../prisma/seed.ts')

  assert.match(queries, /getDemoProductImages/)
  assert.match(seed, /const images = getDemoProductImages\(product\.slug, product\.images\)/)
  assert.match(seed, /calabacin-tierno-temporada/)
})

test('next image config explicitly allows local demo SVG product artwork', () => {
  const nextConfig = readSource('../next.config.ts')

  assert.match(nextConfig, /dangerouslyAllowSVG:\s*true/)
  assert.match(nextConfig, /contentDispositionType:\s*'inline'/)
})

test('producer surfaces use realistic photo helpers instead of illustration-only placeholders', () => {
  const producersPage = readSource('../src/app/(public)/productores/page.tsx')
  const homePage = readSource('../src/app/(public)/HomePageClient.tsx')
  const vendorVisuals = readSource('../src/lib/vendor-visuals.ts')

  assert.match(producersPage, /getVendorHeroImage\(v\)/)
  assert.match(homePage, /getVendorHeroImage\(v\)/)
  assert.match(vendorVisuals, /https:\/\/images\.unsplash\.com/)
  assert.doesNotMatch(vendorVisuals, /demo-product-image/)
})
