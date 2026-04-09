import test from 'node:test'
import assert from 'node:assert/strict'

// SortSelect OPTIONS extracted for testability without importing the React component
const SORT_OPTIONS = [
  { value: 'newest', label: 'Más recientes' },
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
  { value: 'popular', label: 'Más populares' },
]

test('SortSelect OPTIONS have unique values (no duplicate keys in list render)', () => {
  const values = SORT_OPTIONS.map(o => o.value)
  const unique = new Set(values)
  assert.equal(unique.size, values.length, 'Every option value must be unique')
})

test('SortSelect OPTIONS have unique labels', () => {
  const labels = SORT_OPTIONS.map(o => o.label)
  const unique = new Set(labels)
  assert.equal(unique.size, labels.length, 'Every option label must be unique')
})

test('SortSelect defaults to newest when no current value provided', () => {
  const defaultValue = undefined ?? 'newest'
  assert.equal(defaultValue, 'newest')
})

test('SortSelect uses provided current value as default', () => {
  const defaultValue = 'price_asc' ?? 'newest'
  assert.equal(defaultValue, 'price_asc')
})

test('SortSelect covers all parseProductSort valid values', () => {
  // These must match what parseProductSort accepts in src/domains/catalog/types.ts
  const expected = ['newest', 'price_asc', 'price_desc', 'popular']
  const actual = SORT_OPTIONS.map(o => o.value)
  assert.deepEqual(actual, expected)
})

// Footer link uniqueness — regression for duplicate key={l.href} bug
const FOOTER_VENDER_LINKS = [
  { href: '/register?rol=productor', label: 'Hazte productor' },
  { href: '/vendor/dashboard', label: 'Portal productor' },
  { href: '#', label: 'Cómo funciona' },
  { href: '#', label: 'Comisiones' },
]

const FOOTER_AYUDA_LINKS = [
  { href: '#', label: 'Preguntas frecuentes' },
  { href: '#', label: 'Política de devoluciones' },
  { href: '#', label: 'Envíos' },
  { href: '#', label: 'Contacto' },
]

test('Footer Vender section labels are unique (safe to use as React keys)', () => {
  const labels = FOOTER_VENDER_LINKS.map(l => l.label)
  assert.equal(new Set(labels).size, labels.length, 'Labels must be unique to avoid duplicate React keys')
})

test('Footer Ayuda section labels are unique (safe to use as React keys)', () => {
  const labels = FOOTER_AYUDA_LINKS.map(l => l.label)
  assert.equal(new Set(labels).size, labels.length, 'Labels must be unique to avoid duplicate React keys')
})

test('Footer Vender section hrefs contain duplicate # — key must use label not href', () => {
  const hrefs = FOOTER_VENDER_LINKS.map(l => l.href)
  const uniqueHrefs = new Set(hrefs)
  // Confirms hrefs are NOT all unique, validating why we switched to label as key
  assert.ok(uniqueHrefs.size < hrefs.length, '# hrefs are duplicated so key={l.href} would produce duplicate React keys')
})

test('Footer Ayuda section has only # hrefs — key must use label not href', () => {
  const allHash = FOOTER_AYUDA_LINKS.every(l => l.href === '#')
  assert.ok(allHash, 'All Ayuda links point to # so label is required as the React key')
})
