import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildHomeStats } from '@/domains/catalog/home'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('buildHomeStats formats compact counters for large catalog numbers', () => {
  const stats = buildHomeStats({
    activeVendors: 1234,
    activeProducts: 18250,
    averageRating: 4.92,
  })

  assert.equal(stats[0]?.value, '1,2 mil+')
  assert.equal(stats[1]?.value, '18,3 mil+')
  assert.equal(stats[2]?.value, '4.9★')
})

test('buildHomeStats shows zero values when there is no live catalog yet', () => {
  const stats = buildHomeStats({
    activeVendors: 0,
    activeProducts: 0,
    averageRating: null,
  })

  assert.equal(stats[0]?.value, '0')
  assert.equal(stats[1]?.value, '0')
  assert.equal(stats[2]?.label, 'Marketplace en crecimiento')
})

test('home page client uses locale-aware helpers for quick-access cards and category labels', () => {
  const source = readSource('../../src/app/(public)/HomePageClient.tsx')

  assert.match(source, /getPublicPortalLinks\(locale\)/)
  assert.match(source, /translateCategoryLabel\(cat\.slug, cat\.name, locale\)/)
})

test('home category cards expose professional metadata and accessible navigation labels', () => {
  const source = readSource('../../src/app/(public)/HomePageClient.tsx')

  assert.match(source, /sections\.browseByCatDesc/)
  assert.match(source, /aria-label=\{`\$\{label\} · \$\{countLabel\}`\}/)
  assert.match(source, /rounded-3xl border border-\[var\(--border\)\] bg-\[var\(--surface\)\] p-4 shadow-sm/)
})

test('home quick access, featured products and vendor sections use the refined professional layout', () => {
  const source = readSource('../../src/app/(public)/HomePageClient.tsx')

  assert.match(source, /quickAccessDesc/)
  assert.match(source, /sections\.featuredDesc/)
  assert.match(source, /sections\.featuredVendorsDesc/)
  assert.match(source, /sections\.vendorCardCta/)
  assert.match(source, /rounded-3xl border border-\[var\(--border\)\] bg-\[var\(--surface\)\] p-5 shadow-sm/)
})
