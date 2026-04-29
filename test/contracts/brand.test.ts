import test from 'node:test'
import assert from 'node:assert/strict'
import { siteAppearance } from '@/lib/brand'

test('siteAppearance keeps the public storefront in light mode', () => {
  assert.equal(siteAppearance.colorScheme, 'light')
  assert.equal(siteAppearance.faviconPath, '/favicon.ico')
})

test('siteAppearance exposes the core brand colors used by layout metadata', () => {
  assert.match(siteAppearance.themeColor, /^#/)
  assert.match(siteAppearance.background, /^#/)
  assert.match(siteAppearance.accent, /^#/)
})
