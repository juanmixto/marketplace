import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getCatalogCopy, getLocalizedProductCopy, translateProductUnit } from '@/i18n/catalog-copy'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('catalog copy localizes seeded product names, descriptions and units for English', () => {
  const translated = getLocalizedProductCopy(
    {
      slug: 'galletas-avena-miel',
      name: 'Galletas de avena y miel',
      description: 'Crujientes por fuera, tiernas por dentro y con dulzor suave.',
      unit: 'bolsa 300g',
    },
    'en'
  )

  assert.equal(translated.name, 'Oat and honey cookies')
  assert.match(translated.description ?? '', /crispy on the outside/i)
  assert.equal(translated.unit, 'bag 300g')
  assert.equal(translated.translation?.sourceLocale, 'es')
  assert.equal(translated.translation?.isAutoTranslated, true)
  assert.match(translated.translation?.badgeLabel ?? '', /auto-translated from spanish/i)
  assert.equal(translateProductUnit('pack 4 uds', 'en'), 'pack 4 units')
  assert.equal(getCatalogCopy('en').actions.viewDetail, 'View details')
})

test('catalog copy auto-translates new vendor products and exposes translation badge metadata', () => {
  const translated = getLocalizedProductCopy(
    {
      slug: 'queso-cabra-miel-local',
      name: 'Queso de cabra con miel',
      description: 'Producto artesano y natural, ideal para compartir.',
      unit: 'caja',
    },
    'en'
  )

  assert.match(translated.name, /goat cheese with honey/i)
  assert.match(translated.description ?? '', /artisan/i)
  assert.equal(translated.unit, 'box')
  assert.equal(translated.translation?.sourceLocale, 'es')
  assert.equal(translated.translation?.isAutoTranslated, true)
  assert.match(translated.translation?.badgeLabel ?? '', /auto-translated from spanish/i)
})

test('catalog components use locale-aware copy helpers instead of hardcoded Spanish strings', () => {
  const card = readSource('../../src/components/catalog/ProductCard.tsx')
  const filters = readSource('../../src/components/catalog/ProductFiltersPanel.tsx')
  const sort = readSource('../../src/components/catalog/SortSelect.tsx')
  const productsPage = readSource('../../src/app/(public)/productos/page.tsx')
  const detailPage = readSource('../../src/app/(public)/productos/[slug]/page.tsx')

  assert.match(card, /getLocalizedProductCopy\(/)
  assert.match(card, /locale\?: Locale/)
  assert.match(card, /AutoTranslatedBadge/)
  assert.match(filters, /translateCategoryLabel\(cat\.slug, cat\.name, locale\)/)
  assert.match(filters, /getCatalogCopy\(locale\)/)
  assert.match(sort, /getCatalogCopy\(locale\)/)
  assert.match(productsPage, /getServerLocale\(\)/)
  assert.match(productsPage, /getCatalogCopy\(locale\)/)
  assert.match(productsPage, /locale=\{locale\}/)
  assert.match(detailPage, /AutoTranslatedBadge/)
})
