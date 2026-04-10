import test from 'node:test'
import assert from 'node:assert/strict'
import { CACHE_TAGS } from '@/lib/cache-tags'

test('CACHE_TAGS documents stable public cache buckets', () => {
  assert.deepEqual(CACHE_TAGS, {
    catalog: 'catalog',
    products: 'products',
    vendors: 'vendors',
    categories: 'categories',
    home: 'home',
  })
})

test('CACHE_TAGS values are unique to avoid cross-invalidating unrelated caches', () => {
  assert.equal(new Set(Object.values(CACHE_TAGS)).size, Object.keys(CACHE_TAGS).length)
})
