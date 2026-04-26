import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildHomeStats } from '@/domains/catalog/home'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('buildHomeStats carries raw counters through the descriptor shape', () => {
  const stats = buildHomeStats({
    activeVendors: 1234,
    activeProducts: 18250,
    averageRating: 4.92,
  })

  assert.equal(stats[0]?.kind, 'count')
  assert.equal(stats[0]?.kind === 'count' ? stats[0].count : null, 1234)
  assert.equal(stats[1]?.kind, 'count')
  assert.equal(stats[1]?.kind === 'count' ? stats[1].count : null, 18250)
  assert.equal(stats[2]?.kind, 'rating')
  assert.equal(stats[2]?.kind === 'rating' ? stats[2].rating : null, 4.92)
})

test('buildHomeStats emits the growing-marketplace labelKey when there is no live catalog yet', () => {
  const stats = buildHomeStats({
    activeVendors: 0,
    activeProducts: 0,
    averageRating: null,
  })

  assert.equal(stats[0]?.kind === 'count' ? stats[0].count : null, 0)
  assert.equal(stats[1]?.kind === 'count' ? stats[1].count : null, 0)
  assert.equal(stats[2]?.labelKey, 'home.stats.marketplaceGrowing')
})

test('home page formats the hero counters with locale-aware Intl.NumberFormat', () => {
  const source = readSource('../../src/app/(public)/page.tsx')

  assert.match(source, /new Intl\.NumberFormat\(intlLocale/)
  assert.match(source, /notation: 'compact'/)
  assert.match(source, /t\(s\.labelKey\)/)
})

test('home page uses locale-aware helpers for category labels', () => {
  const source = readSource('../../src/app/(public)/page.tsx')

  assert.match(source, /translateCategoryLabel\(cat\.slug, cat\.name, locale\)/)
})

test('home category cards expose professional metadata and accessible navigation labels', () => {
  const source = readSource('../../src/app/(public)/page.tsx')

  assert.match(source, /sections\.browseByCatDesc/)
  assert.match(source, /aria-label=\{`\$\{label\} · \$\{countLabel\}`\}/)
  assert.match(source, /rounded-3xl border border-\[var\(--border\)\] bg-\[var\(--surface\)\] p-4 shadow-sm/)
})

test('home featured products and vendor sections use the refined professional layout', () => {
  const source = readSource('../../src/app/(public)/page.tsx')

  assert.match(source, /sections\.featuredDesc/)
  assert.match(source, /sections\.featuredVendorsDesc/)
  assert.match(source, /sections\.vendorCardCta/)
  assert.match(source, /rounded-3xl border border-\[var\(--border\)\] bg-\[var\(--surface\)\] p-5 shadow-sm/)
})
