import test from 'node:test'
import assert from 'node:assert/strict'
import {
  adminNavItems,
  buyerAccountItems,
  buyerAccountMeta,
  getAvailableNavItems,
  getUpcomingNavItems,
  vendorNavItems,
} from '@/lib/navigation'

test('navigation helpers split available and upcoming sections correctly', () => {
  assert.equal(getAvailableNavItems(vendorNavItems).length, 5)
  assert.equal(getUpcomingNavItems(vendorNavItems).length, 0)
  assert.equal(getAvailableNavItems(adminNavItems).length, 11)
  assert.equal(getUpcomingNavItems(adminNavItems).length, 0)
})

test('buyer account only exposes implemented links as available', () => {
  const available = getAvailableNavItems(buyerAccountItems)
  const upcoming = getUpcomingNavItems(buyerAccountItems)

  assert.deepEqual(
    available.map(item => item.href),
    ['/cuenta/pedidos', '/cuenta/direcciones', '/cuenta/favoritos']
  )
  assert.deepEqual(upcoming.map(item => item.href), ['/cuenta/perfil'])
})

test('buyer account metadata covers every account link to avoid runtime crashes in /cuenta', () => {
  assert.deepEqual(
    Object.keys(buyerAccountMeta).sort(),
    buyerAccountItems.map(item => item.href).sort()
  )
})
