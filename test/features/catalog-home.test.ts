import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHomeStats } from '@/domains/catalog/home'

test('buildHomeStats emits labelKey descriptors for the hero', () => {
  const stats = buildHomeStats({
    activeVendors: 12,
    activeProducts: 148,
    averageRating: 4.67,
  })

  assert.deepEqual(stats, [
    { kind: 'count', labelKey: 'home.stats.activeVendors', count: 12 },
    { kind: 'count', labelKey: 'home.stats.activeProducts', count: 148 },
    { kind: 'rating', labelKey: 'home.stats.averageRating', rating: 4.67 },
  ])
})

test('buildHomeStats falls back to the newBadge descriptor when rating is not available yet', () => {
  const stats = buildHomeStats({
    activeVendors: 1,
    activeProducts: 3,
    averageRating: null,
  })

  assert.deepEqual(stats[2], {
    kind: 'newBadge',
    labelKey: 'home.stats.marketplaceGrowing',
    valueKey: 'home.stats.newBadge',
  })
})
