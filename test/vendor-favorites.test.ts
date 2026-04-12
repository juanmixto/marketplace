import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

// ── VendorFavoriteToggleButton ──────────────────────────────────────────

test('VendorFavoriteToggleButton exists and uses vendor store methods', () => {
  const source = readSource('../src/components/catalog/VendorFavoriteToggleButton.tsx')

  assert.match(source, /useFavoritesStore/)
  assert.match(source, /toggleVendor/)
  assert.match(source, /loadVendorFavorites/)
  assert.match(source, /vendorIds\.has\(vendorId\)/)
})

test('VendorFavoriteToggleButton fires add_to_favorites analytics event', () => {
  const source = readSource('../src/components/catalog/VendorFavoriteToggleButton.tsx')

  assert.match(source, /trackAnalyticsEvent/)
  assert.match(source, /add_to_favorites/)
})

test('VendorFavoriteToggleButton uses i18n for labels', () => {
  const source = readSource('../src/components/catalog/VendorFavoriteToggleButton.tsx')

  assert.match(source, /useT/)
  assert.match(source, /t\('favorites\.save'\)/)
  assert.match(source, /t\('favorites\.saved'\)/)
})

// ── Vendor favorites API endpoints ──────────────────────────────────────

test('vendor favorites GET+POST API endpoint exists with auth and guard', () => {
  const source = readSource('../src/app/api/favoritos/vendors/route.ts')

  assert.match(source, /GET/)
  assert.match(source, /POST/)
  assert.match(source, /auth/)
  assert.match(source, /withFavoritesGuard/)
  assert.match(source, /vendorFavorite/)
})

test('vendor favorites DELETE API endpoint exists', () => {
  const source = readSource('../src/app/api/favoritos/vendors/[vendorId]/route.ts')

  assert.match(source, /DELETE/)
  assert.match(source, /auth/)
  assert.match(source, /vendorFavorite/)
})

test('vendor favorites IDs API endpoint returns vendor IDs', () => {
  const source = readSource('../src/app/api/favoritos/vendors/ids/route.ts')

  assert.match(source, /GET/)
  assert.match(source, /vendorId/)
  assert.match(source, /withFavoritesGuard/)
})

// ── Favorites store vendor support ──────────────────────────────────────

test('favorites-store has vendor state and methods', () => {
  const source = readSource('../src/lib/favorites-store.ts')

  assert.match(source, /vendorIds/)
  assert.match(source, /vendorLoaded/)
  assert.match(source, /loadVendorFavorites/)
  assert.match(source, /toggleVendor/)
  assert.match(source, /hasVendor/)
  assert.match(source, /removeVendor/)
  assert.match(source, /\/api\/favoritos\/vendors\/ids/)
  assert.match(source, /\/api\/favoritos\/vendors/)
})

// ── Producers pages include the toggle button ───────────────────────────

test('producers listing page includes VendorFavoriteToggleButton', () => {
  const source = readSource('../src/app/(public)/productores/page.tsx')

  assert.match(source, /VendorFavoriteToggleButton/)
  assert.match(source, /vendorId=\{v\.id\}/)
})

test('producer detail page includes VendorFavoriteToggleButton', () => {
  const source = readSource('../src/app/(public)/productores/[slug]/page.tsx')

  assert.match(source, /VendorFavoriteToggleButton/)
  assert.match(source, /vendorId=\{vendor\.id\}/)
})

// ── Favorites page has tabs for products and producers ──────────────────

test('favorites page fetches both product and vendor favorites', () => {
  const source = readSource('../src/app/(buyer)/cuenta/favoritos/page.tsx')

  assert.match(source, /vendorFavorite\.findMany/)
  assert.match(source, /favorite\.findMany/)
  assert.match(source, /initialVendorFavorites/)
})

test('FavoritosClient has tabbed UI for products and producers', () => {
  const source = readSource('../src/app/(buyer)/cuenta/favoritos/FavoritosClient.tsx')

  assert.match(source, /activeTab/)
  assert.match(source, /tabProducts/)
  assert.match(source, /tabProducers/)
  assert.match(source, /handleRemoveVendor/)
  assert.match(source, /removeVendor/)
})

// ── i18n keys for vendor favorites ──────────────────────────────────────

test('vendor favorites i18n keys exist in both locales', async () => {
  const { locales } = await import('@/i18n/locales')

  const keys = [
    'favorites.tabProducts',
    'favorites.tabProducers',
    'favorites.emptyVendorsTitle',
    'favorites.emptyVendorsBody',
    'favorites.exploreProducers',
    'favorites.viewProducer',
    'favorites.vendorProducts',
  ]

  for (const key of keys) {
    assert.ok(key in locales.es, `Spanish locale missing key: ${key}`)
    assert.ok(key in locales.en, `English locale missing key: ${key}`)
  }
})

// ── Guard detects VendorFavorite table ──────────────────────────────────

test('favorites guard detects VendorFavorite table missing error', () => {
  const source = readSource('../src/lib/favorites.ts')

  assert.match(source, /VendorFavorite/)
})
