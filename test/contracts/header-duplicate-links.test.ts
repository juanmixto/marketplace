import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('Header derives isBuyerPortal flag from portalHref to detect duplicate links', () => {
  const header = readSource('../../src/components/layout/Header.tsx')

  assert.match(header, /const isBuyerPortal = portalHref === '\/cuenta'/)
})

test('Header desktop dropdown conditionally hides portal link for buyer users', () => {
  const header = readSource('../../src/components/layout/Header.tsx')

  // The hardcoded Mi cuenta link still exists for all roles
  assert.match(header, /href="\/cuenta"/)
  // Portal link is gated behind !isBuyerPortal
  assert.match(header, /!isBuyerPortal/)
})

test('Header hides portal link in all three locations (desktop standalone, dropdown, mobile) for buyers', () => {
  const header = readSource('../../src/components/layout/Header.tsx')

  // 1 declaration + 3 conditional renders = at least 4 occurrences
  const occurrences = (header.match(/isBuyerPortal/g) || []).length
  assert.ok(occurrences >= 4, `Expected at least 4 occurrences of isBuyerPortal, found ${occurrences}`)
})
