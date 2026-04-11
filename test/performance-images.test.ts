import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('server-side product surfaces use next/image instead of SafeImage', () => {
  const card = readSource('../src/components/catalog/ProductCard.tsx')
  const detail = readSource('../src/app/(public)/productos/[slug]/page.tsx')

  assert.match(card, /import Image from 'next\/image'/)
  assert.match(detail, /import Image from 'next\/image'/)
  assert.doesNotMatch(card, /SafeImage/)
  assert.doesNotMatch(detail, /SafeImage/)
})
