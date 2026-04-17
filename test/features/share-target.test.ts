import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveShareTarget, type ShareTargetParams } from '@/lib/pwa/share-target'

// ── Product URL recognition ──────────────────────────────────────────────

test('resolveShareTarget: product URL from own domain → product page', () => {
  const result = resolveShareTarget({
    url: 'http://localhost:3000/productos/tomate-eco',
    text: null,
    title: null,
  })
  assert.equal(result.type, 'product')
  assert.equal(result.redirect, '/productos/tomate-eco?source=share-target')
})

test('resolveShareTarget: product URL embedded in text → product page', () => {
  const result = resolveShareTarget({
    url: null,
    text: 'Mira esto http://localhost:3000/productos/queso-manchego genial!',
    title: null,
  })
  assert.equal(result.type, 'product')
  assert.equal(result.redirect, '/productos/queso-manchego?source=share-target')
})

test('resolveShareTarget: product slug with hyphens and numbers', () => {
  const result = resolveShareTarget({
    url: 'http://localhost:3000/productos/aceite-virgen-extra-500ml',
    text: null,
    title: null,
  })
  assert.equal(result.type, 'product')
  assert.match(result.redirect, /\/productos\/aceite-virgen-extra-500ml/)
})

// ── Vendor URL recognition ───────────────────────────────────────────────

test('resolveShareTarget: vendor URL → vendor profile', () => {
  const result = resolveShareTarget({
    url: 'http://localhost:3000/productores/huerta-del-sol',
    text: null,
    title: null,
  })
  assert.equal(result.type, 'vendor')
  assert.equal(result.redirect, '/productores/huerta-del-sol?source=share-target')
})

// ── Search fallback ──────────────────────────────────────────────────────

test('resolveShareTarget: plain text → search', () => {
  const result = resolveShareTarget({
    url: null,
    text: 'tomates ecológicos',
    title: null,
  })
  assert.equal(result.type, 'search')
  assert.equal(result.redirect, '/buscar?q=tomates%20ecol%C3%B3gicos&source=share-target')
})

test('resolveShareTarget: title-only → search from title', () => {
  const result = resolveShareTarget({
    url: null,
    text: null,
    title: 'Frutas de temporada',
  })
  assert.equal(result.type, 'search')
  assert.match(result.redirect, /\/buscar\?q=Frutas/)
})

test('resolveShareTarget: text with URLs stripped → search with clean query', () => {
  const result = resolveShareTarget({
    url: null,
    text: 'Check out https://external-site.com/page — best organic food',
    title: null,
  })
  assert.equal(result.type, 'search')
  // The external URL should be stripped, leaving only the text.
  assert.match(result.redirect, /\/buscar\?q=/)
  assert.ok(!result.redirect.includes('external-site.com'))
})

test('resolveShareTarget: very long text → capped at 100 chars', () => {
  const longText = 'a'.repeat(200)
  const result = resolveShareTarget({
    url: null,
    text: longText,
    title: null,
  })
  assert.equal(result.type, 'search')
  // The encoded query should use a 100-char truncated string.
  const qParam = new URL(`http://x${result.redirect}`).searchParams.get('q')
  assert.ok(qParam !== null)
  assert.equal(qParam!.length, 100)
})

// ── Home fallback ────────────────────────────────────────────────────────

test('resolveShareTarget: empty params → home', () => {
  const result = resolveShareTarget({ url: null, text: null, title: null })
  assert.equal(result.type, 'home')
  assert.equal(result.redirect, '/?source=share-target')
})

test('resolveShareTarget: only whitespace text → home', () => {
  const result = resolveShareTarget({ url: null, text: '   ', title: null })
  assert.equal(result.type, 'home')
})

test('resolveShareTarget: text is just a URL from another domain → home', () => {
  const result = resolveShareTarget({
    url: null,
    text: 'https://external-site.com/page',
    title: null,
  })
  // After stripping the external URL, text is empty → home.
  assert.equal(result.type, 'home')
})

// ── External / unrecognized URLs ─────────────────────────────────────────

test('resolveShareTarget: URL from different domain → search with remaining text', () => {
  const result = resolveShareTarget({
    url: 'https://other-marketplace.com/product/123',
    text: 'Amazing organic honey',
    title: null,
  })
  // The URL is not ours, so it falls through. Text has content → search.
  assert.equal(result.type, 'search')
  assert.match(result.redirect, /\/buscar\?q=Amazing/)
})

// ── Priority: URL > text > title ─────────────────────────────────────────

test('resolveShareTarget: own product URL takes priority over text', () => {
  const result = resolveShareTarget({
    url: 'http://localhost:3000/productos/miel-romero',
    text: 'searching for honey',
    title: 'My Honey',
  })
  assert.equal(result.type, 'product')
  assert.match(result.redirect, /\/productos\/miel-romero/)
})

// ── All params undefined (defensive) ─────────────────────────────────────

test('resolveShareTarget: all undefined → home', () => {
  const result = resolveShareTarget({} as ShareTargetParams)
  assert.equal(result.type, 'home')
})
