import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('favorites page uses getServerT for i18n instead of hardcoded strings', () => {
  const source = readSource('../../src/app/(buyer)/cuenta/favoritos/page.tsx')

  assert.match(source, /getServerT/)
  assert.match(source, /t\('favorites\.title'\)/)
  assert.match(source, /t\('favorites\.subtitle'\)/)
  assert.match(source, /t\('favorites\.migrationWarning'\)/)
})

test('FavoritosClient uses useT hook for i18n', () => {
  const source = readSource('../../src/app/(buyer)/cuenta/favoritos/FavoritosClient.tsx')

  assert.match(source, /useT/)
  assert.match(source, /t\('favorites\.emptyTitle'\)/)
  assert.match(source, /t\('favorites\.explore'\)/)
  assert.match(source, /t\('favorites\.addToCart'\)/)
  assert.match(source, /t\('favorites\.removeTitle'\)/)
  assert.match(source, /t\('favorites\.outOfStock'\)/)
})

test('FavoritosClient uses useCartStore for add-to-cart instead of console.log stub', () => {
  const source = readSource('../../src/app/(buyer)/cuenta/favoritos/FavoritosClient.tsx')

  assert.match(source, /useCartStore/)
  assert.match(source, /addItem/)
  // Ensure the old console.log stub is gone
  assert.ok(!source.includes("console.log('Add to cart"), 'should not contain console.log add to cart stub')
})

test('FavoritosClient syncs with favorites store on remove', () => {
  const source = readSource('../../src/app/(buyer)/cuenta/favoritos/FavoritosClient.tsx')

  assert.match(source, /useFavoritesStore/)
})

test('favorites i18n keys exist in both Spanish and English locales', async () => {
  const { locales } = await import('@/i18n/locales')

  const requiredKeys = [
    'favorites.title',
    'favorites.subtitle',
    'favorites.emptyTitle',
    'favorites.emptyBody',
    'favorites.explore',
    'favorites.removeTitle',
    'favorites.noImage',
    'favorites.available',
    'favorites.outOfStock',
    'favorites.addToCart',
    'favorites.errorRemove',
    'favorites.migrationWarning',
    'favorites.save',
    'favorites.saved',
    'favorites.saving',
    'favorites.loginToSave',
  ]

  for (const key of requiredKeys) {
    assert.ok(key in locales.es, `Spanish locale missing key: ${key}`)
    assert.ok(key in locales.en, `English locale missing key: ${key}`)
    assert.ok((locales.es as any)[key].length > 0, `Spanish ${key} is empty`)
    assert.ok((locales.en as any)[key].length > 0, `English ${key} is empty`)
  }
})

test('favorites page uses dynamic generateMetadata instead of static metadata export', () => {
  const source = readSource('../../src/app/(buyer)/cuenta/favoritos/page.tsx')

  assert.match(source, /generateMetadata/)
  // Should not have static `export const metadata`
  assert.ok(!source.includes('export const metadata'), 'should not export static metadata')
})
