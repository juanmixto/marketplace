import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('Header exposes accessible names for icon-only actions', () => {
  const source = readSource('../src/components/layout/Header.tsx')

  assert.match(source, /aria-label=\{`Ver carrito/)
  assert.match(source, /aria-label=\{mobileOpen \? 'Cerrar menú' : 'Abrir menú'\}/)
})

test('Cart page exposes labels for quantity and removal controls', () => {
  const source = readSource('../src/components/buyer/CartPageClient.tsx')

  assert.match(source, /aria-label=\{`Reducir cantidad de \$\{item\.name\}`\}/)
  assert.match(source, /aria-label=\{`Aumentar cantidad de \$\{item\.name\}`\}/)
  assert.match(source, /aria-label=\{`Eliminar \$\{item\.name\} del carrito`\}/)
  assert.match(source, /aria-label="Vaciar carrito"/)
})

test('Filters and modal expose the right interactive semantics', () => {
  const filters = readSource('../src/components/catalog/ProductFiltersPanel.tsx')
  const modal = readSource('../src/components/ui/modal.tsx')

  assert.match(filters, /aria-label="Limpiar todos los filtros"/)
  assert.match(filters, /aria-pressed=\{!currentCat\}/)
  assert.match(filters, /aria-pressed=\{currentCat === cat\.slug\}/)
  assert.match(modal, /aria-labelledby=\{title \? titleId : undefined\}/)
  assert.match(modal, /aria-label=\{title \? undefined : 'Diálogo'\}/)
  assert.match(modal, /aria-label="Cerrar modal"/)
})
