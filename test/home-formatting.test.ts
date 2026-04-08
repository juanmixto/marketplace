import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHomeStats } from '@/domains/catalog/home'

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
