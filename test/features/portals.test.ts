import test from 'node:test'
import assert from 'node:assert/strict'
import {
  describeCallbackRejection,
  getAvailablePortals,
  getPortalLabel,
  getPrimaryPortalHref,
  getLoginPortalMode,
  isValidPortalMode,
  normalizeAuthRedirectUrl,
  getPublicPortalLinks,
  resolvePostLoginDestination,
  sanitizeCallbackUrl,
  STOREFRONT_PATH,
  translateCategoryLabel,
} from '@/lib/portals'

test('public portal links are localized for Spanish and English home quick-access cards', () => {
  const esLinks = getPublicPortalLinks('es')
  const enLinks = getPublicPortalLinks('en')

  assert.equal(esLinks.length, 3)
  assert.deepEqual(esLinks.map(link => link.label), ['Comprar', 'Soy productor', 'Panel admin'])
  assert.deepEqual(enLinks.map(link => link.label), ['Shop', 'Producer portal', 'Admin panel'])
  assert.match(enLinks[0]?.description ?? '', /catalog|shop/i)
  assert.match(enLinks[1]?.description ?? '', /dashboard|catalog/i)
})

test('translateCategoryLabel uses English i18n names but falls back safely for unknown slugs', () => {
  assert.equal(translateCategoryLabel('verduras', 'Verduras y Hortalizas', 'en'), 'Vegetables & Greens')
  assert.equal(translateCategoryLabel('miel', 'Miel y Mermeladas', 'en'), 'Honey & Jams')
  assert.equal(translateCategoryLabel('desconocida', 'Nombre libre', 'en'), 'Nombre libre')
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

test('buyer portal href matches the hardcoded /cuenta path used in Header dropdown', () => {
  assert.equal(getPrimaryPortalHref(undefined), '/cuenta')
  assert.equal(getPrimaryPortalHref('CUSTOMER'), '/cuenta')
  assert.notEqual(getPrimaryPortalHref('VENDOR'), '/cuenta')
  assert.notEqual(getPrimaryPortalHref('SUPERADMIN'), '/cuenta')
})

test('buyer portal label matches myAccount translation confirming duplication source', () => {
  assert.equal(getPortalLabel(undefined, 'es'), 'Mi cuenta')
  assert.equal(getPortalLabel('CUSTOMER', 'es'), 'Mi cuenta')
  assert.notEqual(getPortalLabel('VENDOR', 'es'), 'Mi cuenta')
  assert.notEqual(getPortalLabel('SUPERADMIN', 'es'), 'Mi cuenta')
})

// ---------------------------------------------------------------------------
// Hardening of sanitizeCallbackUrl (ticket #352).
// Each case documents the attack class it guards against.
// ---------------------------------------------------------------------------

test('sanitizeCallbackUrl accepts allowlisted internal paths', () => {
  const ok = [
    '/',
    '/cuenta',
    '/cuenta/pedidos',
    '/vendor/dashboard',
    '/admin/dashboard?tab=orders',
    '/productos',
    '/productos?categoria=verduras',
    '/productores/juanito-slug',
    '/carrito',
    '/checkout',
  ]
  for (const url of ok) {
    assert.equal(sanitizeCallbackUrl(url), url, `expected accept: ${url}`)
    assert.equal(describeCallbackRejection(url), null, `expected null reason: ${url}`)
  }
})

test('sanitizeCallbackUrl rejects absolute and protocol-relative URLs', () => {
  assert.equal(sanitizeCallbackUrl('https://evil.example.com'), undefined)
  assert.equal(sanitizeCallbackUrl('http://evil.example.com'), undefined)
  assert.equal(sanitizeCallbackUrl('//evil.example.com'), undefined)
  assert.equal(describeCallbackRejection('//evil.example.com'), 'protocol_relative')
  assert.equal(describeCallbackRejection('https://evil.example.com'), 'not_relative')
})

test('sanitizeCallbackUrl rejects backslash tricks (some browsers normalize \\ to /)', () => {
  assert.equal(sanitizeCallbackUrl('/\\evil.example.com'), undefined)
  assert.equal(sanitizeCallbackUrl('/\\\\evil.example.com'), undefined)
  assert.equal(describeCallbackRejection('/\\evil.example.com'), 'forbidden_chars')
})

test('sanitizeCallbackUrl rejects userinfo-style `@` tokens', () => {
  // /foo@evil.com — the URL parser in some runtimes reads this as a
  // credential-bearing URL and may follow it as an absolute destination.
  assert.equal(sanitizeCallbackUrl('/foo@evil.example.com'), undefined)
  assert.equal(describeCallbackRejection('/foo@evil.example.com'), 'forbidden_chars')
})

test('sanitizeCallbackUrl rejects CR/LF and control characters', () => {
  assert.equal(sanitizeCallbackUrl('/foo\nbar'), undefined)
  assert.equal(sanitizeCallbackUrl('/foo\r\nSet-Cookie: x=y'), undefined)
  assert.equal(sanitizeCallbackUrl('/foo\tbar'), undefined)
  assert.equal(sanitizeCallbackUrl('/foo\x00bar'), undefined)
  assert.equal(describeCallbackRejection('/foo\nbar'), 'forbidden_chars')
})

test('sanitizeCallbackUrl rejects URL-encoded forbidden characters after decode', () => {
  // %2f%2fevil.com decodes to //evil.com
  assert.equal(sanitizeCallbackUrl('/%2f%2fevil.example.com'), undefined)
  // %5c → backslash
  assert.equal(sanitizeCallbackUrl('/%5cevil.example.com'), undefined)
  // %0a → newline
  assert.equal(sanitizeCallbackUrl('/foo%0abar'), undefined)
})

test('sanitizeCallbackUrl rejects double-encoded attacks', () => {
  // %252f%252fevil.com → %2f%2fevil.com → //evil.com
  assert.equal(sanitizeCallbackUrl('/%252f%252fevil.example.com'), undefined)
})

test('sanitizeCallbackUrl rejects exotic schemes after decoding', () => {
  // In practice any candidate starting with "javascript:" fails the
  // "must start with /" check, but after decoding we re-check for
  // scheme-like sequences to catch obfuscated variants.
  assert.equal(sanitizeCallbackUrl('javascript:alert(1)'), undefined)
  assert.equal(describeCallbackRejection('javascript:alert(1)'), 'not_relative')
})

test('sanitizeCallbackUrl rejects login and register to prevent redirect loops', () => {
  assert.equal(sanitizeCallbackUrl('/login'), undefined)
  assert.equal(sanitizeCallbackUrl('/login?callbackUrl=%2Fadmin%2Fdashboard'), undefined)
  assert.equal(sanitizeCallbackUrl('/register'), undefined)
  assert.equal(describeCallbackRejection('/login'), 'login_or_register')
})

test('sanitizeCallbackUrl rejects paths outside the allowlist', () => {
  assert.equal(sanitizeCallbackUrl('/api/internal/secret'), undefined)
  assert.equal(sanitizeCallbackUrl('/some-random-path'), undefined)
  assert.equal(describeCallbackRejection('/api/internal/secret'), 'not_in_allowlist')
})

test('resolvePostLoginDestination reports role mismatch via onRoleMismatch callback', () => {
  const rejections: Array<Record<string, unknown>> = []
  const dest = resolvePostLoginDestination('CUSTOMER', '/admin/dashboard', {
    onRoleMismatch: (details) => rejections.push(details),
  })

  assert.equal(dest, '/cuenta')
  assert.equal(rejections.length, 1)
  assert.equal(rejections[0]?.callbackMode, 'admin')
  assert.equal(rejections[0]?.roleMode, 'buyer')
})

test('resolvePostLoginDestination does not invoke onRoleMismatch for matching callbacks', () => {
  let called = false
  const dest = resolvePostLoginDestination('VENDOR', '/vendor/productos', {
    onRoleMismatch: () => { called = true },
  })

  assert.equal(dest, '/vendor/productos')
  assert.equal(called, false)
})

// ---------------------------------------------------------------------------
// Portal switcher + lastPortal cookie (ticket #349).
// ---------------------------------------------------------------------------

test('isValidPortalMode only accepts the three known modes', () => {
  assert.equal(isValidPortalMode('buyer'), true)
  assert.equal(isValidPortalMode('vendor'), true)
  assert.equal(isValidPortalMode('admin'), true)
  assert.equal(isValidPortalMode('BUYER'), false)
  assert.equal(isValidPortalMode(''), false)
  assert.equal(isValidPortalMode(null), false)
  assert.equal(isValidPortalMode(undefined), false)
  assert.equal(isValidPortalMode(42), false)
})

test('getAvailablePortals returns empty list for anonymous', () => {
  assert.deepEqual(getAvailablePortals(undefined), [])
})

test('getAvailablePortals gives CUSTOMER only the buyer portal', () => {
  const portals = getAvailablePortals('CUSTOMER')
  assert.equal(portals.length, 1)
  assert.equal(portals[0]?.mode, 'buyer')
})

test('getAvailablePortals gives VENDOR both buyer and vendor portals', () => {
  const portals = getAvailablePortals('VENDOR')
  assert.deepEqual(portals.map(p => p.mode), ['buyer', 'vendor'])
  assert.equal(portals.find(p => p.mode === 'vendor')?.href, '/vendor/dashboard')
})

test('getAvailablePortals gives admins both buyer and admin portals', () => {
  const support = getAvailablePortals('ADMIN_SUPPORT')
  assert.deepEqual(support.map(p => p.mode), ['buyer', 'admin'])
  const superAdmin = getAvailablePortals('SUPERADMIN')
  assert.deepEqual(superAdmin.map(p => p.mode), ['buyer', 'admin'])
})

test('resolvePostLoginDestination honors lastPortal when role has access and no callback', () => {
  // A vendor who last used the buyer portal should land back on /cuenta,
  // not /vendor/dashboard, on their next login.
  assert.equal(
    resolvePostLoginDestination('VENDOR', undefined, { lastPortal: 'buyer' }),
    '/cuenta'
  )
  // An admin who last used the admin portal still lands there.
  assert.equal(
    resolvePostLoginDestination('SUPERADMIN', undefined, { lastPortal: 'admin' }),
    '/admin/dashboard'
  )
})

test('resolvePostLoginDestination ignores lastPortal when role lacks access to it', () => {
  // A CUSTOMER with a stale "vendor" cookie must NOT be redirected to the
  // vendor dashboard — they don't have access.
  assert.equal(
    resolvePostLoginDestination('CUSTOMER', undefined, { lastPortal: 'vendor' }),
    '/cuenta'
  )
  assert.equal(
    resolvePostLoginDestination('CUSTOMER', undefined, { lastPortal: 'admin' }),
    '/cuenta'
  )
})

test('resolvePostLoginDestination lets explicit callback win over lastPortal', () => {
  // Callback URL is an explicit user intent from the URL; it should not
  // be overridden by the "last used" preference.
  assert.equal(
    resolvePostLoginDestination('VENDOR', '/vendor/productos', { lastPortal: 'buyer' }),
    '/vendor/productos'
  )
})
