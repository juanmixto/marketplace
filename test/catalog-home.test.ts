import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHomeStats } from '@/domains/catalog/home'

test('buildHomeStats formats active catalog metrics for the hero', () => {
  const stats = buildHomeStats({
    activeVendors: 12,
    activeProducts: 148,
    averageRating: 4.67,
  })

  assert.deepEqual(stats, [
    { value: '12+', label: 'Productores activos' },
    { value: '148+', label: 'Productos publicados' },
    { value: '4.7★', label: 'Valoración media' },
  ])
})

test('buildHomeStats falls back gracefully when rating is not available yet', () => {
  const stats = buildHomeStats({
    activeVendors: 1,
    activeProducts: 3,
    averageRating: null,
  })

  assert.equal(stats[2]?.value, 'Nueva')
  assert.equal(stats[2]?.label, 'Marketplace en crecimiento')
})
