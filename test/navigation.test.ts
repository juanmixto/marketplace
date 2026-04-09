import test from 'node:test'
import assert from 'node:assert/strict'
import {
  adminNavItems,
  buyerAccountItems,
  getAvailableNavItems,
  getUpcomingNavItems,
  vendorNavItems,
} from '@/lib/navigation'

test('navigation helpers split available and upcoming sections correctly', () => {
  assert.equal(getAvailableNavItems(vendorNavItems).length, 4)
  assert.equal(getUpcomingNavItems(vendorNavItems).length, 1)
  assert.equal(getAvailableNavItems(adminNavItems).length, 10)
  assert.equal(getUpcomingNavItems(adminNavItems).length, 0)
})

test('buyer account only exposes implemented links as available', () => {
  const available = getAvailableNavItems(buyerAccountItems)
  const upcoming = getUpcomingNavItems(buyerAccountItems)

  assert.deepEqual(available.map(item => item.href), ['/cuenta/pedidos'])
  assert.deepEqual(upcoming.map(item => item.href), ['/cuenta/direcciones', '/cuenta/perfil'])
})
