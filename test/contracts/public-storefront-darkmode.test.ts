import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('SortSelect preserves existing filters when updating sort order', () => {
  const source = readSource('../../src/components/catalog/SortSelect.tsx')

  assert.match(source, /useSearchParams/)
  assert.match(source, /params\.set\('orden', value\)/)
  assert.match(source, /params\.delete\('pagina'\)/)
  assert.match(source, /router\.push\(`\$\{pathname\}\?\$\{params\.toString\(\)\}`\)/)
})

test('Header interactions expose focus-visible treatment in dark mode', () => {
  const source = readSource('../../src/components/layout/Header.tsx')

  assert.match(source, /focus-visible:ring-2/)
  assert.match(source, /focus-visible:ring-offset-\[var\(--background\)\]/)
  assert.match(source, /aria-expanded=\{mobileOpen\}/)
  assert.match(source, /aria-expanded=\{catOpen\}/)
})

test('Catalog cards and filters add stronger contrast and focus states', () => {
  const card = readSource('../../src/components/catalog/ProductCard.tsx')
  const filters = readSource('../../src/components/catalog/ProductFiltersPanel.tsx')
  const purchase = readSource('../../src/components/catalog/ProductPurchasePanel.tsx')

  assert.match(card, /hover:border-\[var\(--border-strong\)\]/)
  assert.match(card, /focus-visible:ring-2/)
  assert.match(filters, /border-emerald-200 bg-emerald-50/)
  assert.match(filters, /focus-visible:ring-2/)
  assert.match(purchase, /rounded-3xl border border-\[var\(--border\)\] bg-\[var\(--surface\)\]/)
  assert.match(purchase, /focus-visible:ring-2/)
})

test('Review UI improves dark contrast for stars and textarea focus', () => {
  const stars = readSource('../../src/components/reviews/StarRating.tsx')
  const reviewForm = readSource('../../src/components/reviews/ReviewFormButton.tsx')

  assert.match(stars, /dark:text-amber-700/)
  assert.match(reviewForm, /focus-visible:ring-amber-400\/40/)
  assert.match(reviewForm, /dark:text-red-400/)
})
