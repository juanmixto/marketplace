import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('Header exposes localized accessible names for icon-only actions', () => {
  const source = readSource('../../src/components/layout/Header.tsx')

  assert.match(source, /const liveCartCount = useCartStore/)
  assert.match(source, /const effectiveCartCount = Math\.max\(cartCount, liveCartCount\)/)
  assert.match(source, /const cartAriaLabel =/)
  assert.match(source, /t\('cart'\)/)
  assert.match(source, /t\('close_menu'\)/)
  assert.match(source, /t\('open_menu'\)/)
})

test('Cart page exposes labels for quantity and removal controls', () => {
  const source = readSource('../../src/components/buyer/CartPageClient.tsx')

  assert.match(source, /aria-label=\{`Reducir cantidad de \$\{item\.name\}`\}/)
  assert.match(source, /aria-label=\{`Aumentar cantidad de \$\{item\.name\}`\}/)
  assert.match(source, /aria-label=\{`Eliminar \$\{item\.name\} del carrito`\}/)
  assert.match(source, /aria-label=\{t\('cart\.clearCart'\)\}|aria-label="Vaciar carrito"/)
})

test('Filters and modal expose the right interactive semantics', () => {
  const filters = readSource('../../src/components/catalog/ProductFiltersPanel.tsx')
  const modal = readSource('../../src/components/ui/modal.tsx')

  assert.match(filters, /aria-label=\{copy\.filters\.clearAllAria\}/)
  assert.match(filters, /aria-pressed=\{!currentCat\}/)
  assert.match(filters, /aria-pressed=\{currentCat === cat\.slug\}/)
  assert.match(modal, /aria-labelledby=\{title \? titleId : undefined\}/)
  assert.match(modal, /aria-label=\{title \? undefined : t\('modal\.defaultAria'\)\}/)
  assert.match(modal, /aria-label=\{t\('modal\.closeLabel'\)\}/)
})
