import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FAVORITES_UNAVAILABLE_MESSAGE,
  isFavoritesTableMissingError,
  withFavoritesGuard,
} from '@/lib/favorites'

test('isFavoritesTableMissingError detects the missing Favorite table scenario', () => {
  assert.equal(
    isFavoritesTableMissingError({ code: 'P2021', meta: { modelName: 'Favorite' } }),
    true
  )
  assert.equal(
    isFavoritesTableMissingError({ code: 'P2021', message: 'The table public.Favorite does not exist.' }),
    true
  )
  assert.equal(isFavoritesTableMissingError({ code: 'P2021', meta: { modelName: 'Order' } }), false)
  assert.equal(isFavoritesTableMissingError(new Error('boom')), false)
})

test('isFavoritesTableMissingError also detects VendorFavorite table missing', () => {
  assert.equal(
    isFavoritesTableMissingError({ code: 'P2021', meta: { modelName: 'VendorFavorite' } }),
    true
  )
  assert.equal(
    isFavoritesTableMissingError({ code: 'P2021', message: 'The table public.VendorFavorite does not exist.' }),
    true
  )
})

test('withFavoritesGuard returns fallback data when favorites are temporarily unavailable', async () => {
  const result = await withFavoritesGuard(async () => {
    throw { code: 'P2021', meta: { modelName: 'Favorite' } }
  }, [] as string[])

  assert.deepEqual(result.value, [])
  assert.equal(result.unavailable, true)
  assert.match(FAVORITES_UNAVAILABLE_MESSAGE, /favoritos/i)
})

test('withFavoritesGuard rethrows unrelated errors', async () => {
  await assert.rejects(
    () => withFavoritesGuard(async () => {
      throw new Error('unexpected failure')
    }, [] as string[]),
    /unexpected failure/
  )
})
