import test from 'node:test'
import assert from 'node:assert/strict'
import { CACHE_TAGS } from '@/lib/cache-tags'

test('CACHE_TAGS documents stable coarse-grained public buckets', () => {
  assert.equal(CACHE_TAGS.catalog, 'catalog')
  assert.equal(CACHE_TAGS.products, 'products')
  assert.equal(CACHE_TAGS.vendors, 'vendors')
  assert.equal(CACHE_TAGS.categories, 'categories')
  assert.equal(CACHE_TAGS.home, 'home')
})

test('coarse CACHE_TAGS string values are unique', () => {
  const strings = [
    CACHE_TAGS.catalog,
    CACHE_TAGS.products,
    CACHE_TAGS.vendors,
    CACHE_TAGS.categories,
    CACHE_TAGS.home,
  ]
  assert.equal(new Set(strings).size, strings.length)
})

test('fine-grained tag builders namespace entities to avoid collisions', () => {
  assert.equal(CACHE_TAGS.product('tomate-rf'), 'product:tomate-rf')
  assert.equal(CACHE_TAGS.vendor('casa-rosa'), 'vendor:casa-rosa')
  assert.equal(CACHE_TAGS.category('verduras'), 'category:verduras')
})

test('fine-grained tags never collide with coarse tags', () => {
  const coarse: ReadonlySet<string> = new Set<string>([
    CACHE_TAGS.catalog,
    CACHE_TAGS.products,
    CACHE_TAGS.vendors,
    CACHE_TAGS.categories,
    CACHE_TAGS.home,
  ])
  assert.equal(coarse.has(CACHE_TAGS.product('x')), false)
  assert.equal(coarse.has(CACHE_TAGS.vendor('x')), false)
  assert.equal(coarse.has(CACHE_TAGS.category('x')), false)
})

test('fine-grained tags for different entities never collide', () => {
  assert.notEqual(CACHE_TAGS.product('x'), CACHE_TAGS.vendor('x'))
  assert.notEqual(CACHE_TAGS.product('x'), CACHE_TAGS.category('x'))
  assert.notEqual(CACHE_TAGS.vendor('x'), CACHE_TAGS.category('x'))
})
