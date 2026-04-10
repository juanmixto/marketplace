import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPortalLabel,
  getPrimaryPortalHref,
  getLoginPortalMode,
  normalizeAuthRedirectUrl,
  publicPortalLinks,
  resolvePostLoginDestination,
  sanitizeCallbackUrl,
  STOREFRONT_PATH,
} from '@/lib/portals'

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

test('getPortalLabel resolves role-aware labels', () => {
  assert.equal(getPortalLabel(undefined), 'Mi cuenta')
  assert.equal(getPortalLabel('VENDOR'), 'Panel productor')
  assert.equal(getPortalLabel('SUPERADMIN'), 'Panel admin')
})

test('sanitizeCallbackUrl only keeps safe internal destinations', () => {
  assert.equal(sanitizeCallbackUrl('/vendor/dashboard'), '/vendor/dashboard')
  assert.equal(sanitizeCallbackUrl('/login?callbackUrl=%2Fadmin%2Fdashboard'), undefined)
  assert.equal(sanitizeCallbackUrl('https://malicioso.example.com'), undefined)
  assert.equal(sanitizeCallbackUrl('//evil.example.com'), undefined)
})

test('resolvePostLoginDestination prefers safe callback urls and falls back by role', () => {
  assert.equal(resolvePostLoginDestination('VENDOR', '/vendor/productos'), '/vendor/productos')
  assert.equal(resolvePostLoginDestination('SUPERADMIN', '/vendor/dashboard'), '/admin/dashboard')
  assert.equal(resolvePostLoginDestination('CUSTOMER', '/vendor/dashboard'), '/cuenta')
  assert.equal(resolvePostLoginDestination(undefined, '/login'), STOREFRONT_PATH)
})

test('normalizeAuthRedirectUrl converts localhost absolute urls into same-origin paths', () => {
  assert.equal(normalizeAuthRedirectUrl('https://localhost:3005/vendor/dashboard'), '/vendor/dashboard')
  assert.equal(normalizeAuthRedirectUrl('http://localhost:3000/admin/dashboard?tab=orders'), '/admin/dashboard?tab=orders')
  assert.equal(normalizeAuthRedirectUrl('/cuenta'), '/cuenta')
})

test('getLoginPortalMode detects the intended portal from callback urls', () => {
  assert.equal(getLoginPortalMode('/vendor/dashboard'), 'vendor')
  assert.equal(getLoginPortalMode('/admin/dashboard'), 'admin')
  assert.equal(getLoginPortalMode('/cuenta'), 'buyer')
  assert.equal(getLoginPortalMode(undefined), 'buyer')
})
