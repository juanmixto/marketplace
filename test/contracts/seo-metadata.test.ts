import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('global layout advertises metadataBase and social metadata defaults', () => {
  const layout = readSource('../../src/app/layout.tsx')

  assert.match(layout, /metadataBase: SITE_METADATA_BASE/)
  assert.match(layout, /openGraph:/)
  assert.match(layout, /twitter:/)
  assert.match(layout, /SessionProvider/)
})

test('public pages expose canonical metadata and social cards', () => {
  const sources = [
    '../../src/app/(public)/page.tsx',
    '../../src/app/(public)/contacto/page.tsx',
    '../../src/app/(public)/productos/page.tsx',
    '../../src/app/(public)/productores/page.tsx',
    '../../src/app/(public)/buscar/page.tsx',
  ]

  for (const path of sources) {
    const source = readSource(path)
    assert.match(source, /buildPageMetadata|title: \{ absolute: SITE_NAME \}/)
  }

  assert.match(readSource('../../src/app/(public)/buscar/page.tsx'), /noindex: true/)
  assert.match(readSource('../../src/app/(public)/page.tsx'), /JsonLd/)
  assert.match(readSource('../../src/app/(public)/productos/[slug]/page.tsx'), /JsonLd/)
  assert.match(readSource('../../src/app/(public)/productores/[slug]/page.tsx'), /JsonLd/)
})

test('social image routes exist for open graph and twitter cards', () => {
  assert.match(readSource('../../src/app/opengraph-image.tsx'), /ImageResponse/)
  assert.match(readSource('../../src/app/twitter-image.tsx'), /ImageResponse/)
})

test('public layout no longer depends on auth() and stays cache-friendly', () => {
  const layout = readSource('../../src/app/(public)/layout.tsx')

  assert.doesNotMatch(layout, /auth\(\)/)
  assert.match(layout, /<Header \/>/)
})
