import test from 'node:test'
import assert from 'node:assert/strict'
import { parseProductSort } from '@/domains/catalog/types'

test('parseProductSort accepts known values', () => {
  assert.equal(parseProductSort('price_asc'), 'price_asc')
  assert.equal(parseProductSort('price_desc'), 'price_desc')
  assert.equal(parseProductSort('popular'), 'popular')
})

test('parseProductSort falls back to newest for unknown values', () => {
  assert.equal(parseProductSort(undefined), 'newest')
  assert.equal(parseProductSort('random-value'), 'newest')
})
