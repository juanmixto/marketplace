import test from 'node:test'
import assert from 'node:assert/strict'
import { getPrimaryPortalHref, publicPortalLinks } from '@/lib/portals'

test('publicPortalLinks exposes direct access routes for buyer, vendor and admin', () => {
  assert.equal(publicPortalLinks.length, 3)
  assert.deepEqual(
    publicPortalLinks.map(link => link.label),
    ['Comprar', 'Soy productor', 'Admin']
  )
})

test('getPrimaryPortalHref resolves role-aware destinations', () => {
  assert.equal(getPrimaryPortalHref(undefined), '/cuenta')
  assert.equal(getPrimaryPortalHref('VENDOR'), '/vendor/dashboard')
  assert.equal(getPrimaryPortalHref('SUPERADMIN'), '/admin/dashboard')
  assert.equal(getPrimaryPortalHref('ADMIN_SUPPORT'), '/admin/dashboard')
})
