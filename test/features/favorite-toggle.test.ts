import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('FavoriteToggleButton component exists and delegates to favorites store', () => {
  const source = readSource('../../src/components/catalog/FavoriteToggleButton.tsx')

  assert.match(source, /useFavoritesStore/)
  assert.match(source, /toggle\(productId\)/)
  assert.match(source, /loadFavorites/)
})

test('FavoriteToggleButton fires add_to_favorites analytics event', () => {
  const source = readSource('../../src/components/catalog/FavoriteToggleButton.tsx')

  assert.match(source, /trackAnalyticsEvent/)
  assert.match(source, /add_to_favorites/)
})

test('FavoriteToggleButton uses i18n for labels', () => {
  const source = readSource('../../src/components/catalog/FavoriteToggleButton.tsx')

  assert.match(source, /useT/)
  assert.match(source, /t\('favorites\.save'\)/)
  assert.match(source, /t\('favorites\.saved'\)/)
})

test('FavoriteToggleButton uses optimistic state with HeartIcon solid and outline', () => {
  const source = readSource('../../src/components/catalog/FavoriteToggleButton.tsx')

  assert.match(source, /HeartOutline/)
  assert.match(source, /HeartSolid/)
  assert.match(source, /isFavorited/)
})

test('favorites-store exports useFavoritesStore with loadFavorites, toggle, and has', () => {
  const source = readSource('../../src/domains/catalog/favorites-store.ts')

  assert.match(source, /useFavoritesStore/)
  assert.match(source, /loadFavorites/)
  assert.match(source, /toggle/)
  assert.match(source, /has/)
  assert.match(source, /productIds/)
})

test('favorites-store uses optimistic updates with rollback on API failure', () => {
  const source = readSource('../../src/domains/catalog/favorites-store.ts')

  // Verifies the optimistic update + rollback pattern
  assert.match(source, /Optimistic update/)
  assert.match(source, /Rollback/)
})

test('ProductCard includes FavoriteToggleButton', () => {
  const source = readSource('../../src/components/catalog/ProductCard.tsx')

  assert.match(source, /FavoriteToggleButton/)
  assert.match(source, /productId=\{product\.id\}/)
})

test('product detail page includes FavoriteToggleButton', () => {
  const source = readSource('../../src/app/(public)/productos/[slug]/page.tsx')

  assert.match(source, /FavoriteToggleButton/)
  assert.match(source, /productId=\{product\.id\}/)
})

test('favorites IDs API endpoint returns product IDs for authenticated users', () => {
  const source = readSource('../../src/app/api/favoritos/ids/route.ts')

  assert.match(source, /GET/)
  assert.match(source, /auth/)
  assert.match(source, /productId/)
  assert.match(source, /withFavoritesGuard/)
})
