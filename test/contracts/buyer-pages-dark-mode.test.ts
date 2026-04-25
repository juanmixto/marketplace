/**
 * Dark mode compliance tests for buyer account pages (Issue #21).
 *
 * Ensures all buyer/cuenta pages and their client components use CSS theme
 * variables (var(--foreground), var(--surface), etc.) rather than hardcoded
 * Tailwind color classes.  This is a static-analysis test — no runtime or DB
 * access required.
 */
import { readFileSync } from 'fs'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'path'

// ── Helpers ────────────────────────────────────────────────────────────────

function read(relPath: string) {
  return readFileSync(resolve(relPath), 'utf-8')
}

// Patterns that indicate a hardcoded color being used where a theme variable
// should appear.  Exceptions (e.g. intentional brand accent classes on
// interactive elements) are expected to be covered by the dark: variant
// and are not tested here.
const HARDCODED_BG = [
  /\bbg-white\b/,
  /\bbg-gray-\d+\b/,
]

const HARDCODED_TEXT = [
  /\btext-gray-\d+\b/,
]

const HARDCODED_BORDER = [
  /\bborder-gray-\d+\b/,
]

function assertNoHardcodedColors(content: string, label: string) {
  // Strip dark: / hover: / focus: prefixed tokens — those are intentional
  // variants and are allowed (e.g. dark:text-gray-950 for contrast on dark bg).
  const stripped = content.replace(/\b(?:dark|hover|focus|active|disabled):[^\s"'`]*/g, '')

  for (const pattern of [...HARDCODED_BG, ...HARDCODED_TEXT, ...HARDCODED_BORDER]) {
    const match = stripped.match(pattern)
    assert.ok(
      !match,
      `${label}: found hardcoded color class "${match?.[0]}" — use a theme variable instead`,
    )
  }
}

function assertUsesThemeVars(content: string, label: string) {
  const hasVar =
    content.includes('var(--foreground)') ||
    content.includes('var(--surface)')    ||
    content.includes('var(--border)')     ||
    content.includes('[var(--')
  assert.ok(hasVar, `${label}: should reference at least one CSS theme variable`)
}

// ── Page-level tests ───────────────────────────────────────────────────────

describe('buyer/cuenta pages — dark mode compliance', () => {
  const pages: [string, string][] = [
    ['cuenta/direcciones page',    'src/app/(buyer)/cuenta/direcciones/page.tsx'],
    ['cuenta/direcciones client',  'src/app/(buyer)/cuenta/direcciones/DireccionesClient.tsx'],
    ['cuenta/favoritos page',      'src/app/(buyer)/cuenta/favoritos/page.tsx'],
    ['cuenta/favoritos client',    'src/app/(buyer)/cuenta/favoritos/FavoritosClient.tsx'],
    ['cuenta/perfil page',         'src/app/(buyer)/cuenta/perfil/page.tsx'],
    ['BuyerProfileForm component', 'src/components/buyer/BuyerProfileForm.tsx'],
    ['cuenta/pedidos page',        'src/app/(buyer)/cuenta/pedidos/page.tsx'],
    ['cuenta page',                'src/app/(buyer)/cuenta/page.tsx'],
  ]

  for (const [label, relPath] of pages) {
    test(`${label}: no hardcoded gray/white Tailwind classes`, () => {
      const content = read(relPath)
      assertNoHardcodedColors(content, label)
    })

    test(`${label}: uses CSS theme variables`, () => {
      const content = read(relPath)
      assertUsesThemeVars(content, label)
    })
  }
})

// ── DireccionesClient — functional completeness ────────────────────────────

describe('DireccionesClient — structure', () => {
  const content = read('src/app/(buyer)/cuenta/direcciones/DireccionesClient.tsx')

  test('renders an add-address button', () => {
    assert.ok(
      content.includes('Añadir dirección') || content.includes('account.addAddress'),
      'should have an "Añadir dirección" control'
    )
  })

  test('includes all required address fields', () => {
    for (const field of ['firstName', 'lastName', 'line1', 'city', 'province', 'postalCode']) {
      assert.ok(content.includes(field), `should register form field "${field}"`)
    }
  })

  test('calls the correct API endpoints', () => {
    assert.ok(content.includes('/api/direcciones'),               'should call /api/direcciones')
    assert.ok(content.includes('/api/direcciones/${editingId}'),  'should call /api/direcciones/:id for PUT')
    assert.ok(content.includes('/predeterminada'),                'should call the predeterminada endpoint')
  })

  test('validates Spanish postal code format', () => {
    // DireccionesClient now consumes the shared buyer-address schema
    // instead of redeclaring its own postal regex — the contract lives
    // in `src/domains/auth/buyer-address-schema.ts`.
    const schemaContent = read('src/domains/auth/buyer-address-schema.ts')
    assert.ok(
      content.includes('buyerAddressSchema') && schemaContent.includes('\\d{5}'),
      'should validate 5-digit Spanish postal code via the shared schema',
    )
  })
})

// ── FavoritosClient — functional completeness ─────────────────────────────

describe('FavoritosClient — structure', () => {
  const content = read('src/app/(buyer)/cuenta/favoritos/FavoritosClient.tsx')

  test('calls DELETE /api/favoritos/:id on remove', () => {
    assert.ok(
      content.includes('/api/favoritos/${productId}') ||
      content.includes('/api/favoritos/'),
      'should call the favoritos DELETE endpoint',
    )
  })

  test('shows empty-state message', () => {
    assert.ok(content.includes('favoritos') || content.includes('favorites'), 'should contain an empty-state message about favorites')
  })

  test('uses useCartStore for add-to-cart functionality', () => {
    assert.ok(content.includes('useCartStore'), 'should use useCartStore for cart integration')
  })
})

// ── BuyerProfileForm — functional completeness ────────────────────────────

describe('BuyerProfileForm — structure', () => {
  const content = read('src/components/buyer/BuyerProfileForm.tsx')

  test('calls PUT /api/buyers/profile', () => {
    assert.ok(content.includes('/api/buyers/profile'), 'should call the profile update endpoint')
  })

  test('calls PUT /api/buyers/password', () => {
    assert.ok(content.includes('/api/buyers/password'), 'should call the password change endpoint')
  })

  test('validates new password minimum length', () => {
    assert.ok(content.includes('min(8'), 'password should require at least 8 characters')
  })

  test('validates passwords match', () => {
    assert.ok(content.includes('confirmPassword'), 'should include a confirm-password field')
  })
})
