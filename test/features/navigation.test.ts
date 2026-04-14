import test from 'node:test'
import assert from 'node:assert/strict'
import {
  adminNavItems,
  buyerAccountItems,
  buyerAccountMeta,
  getAvailableNavItems,
  getUpcomingNavItems,
  vendorNavItems,
} from '@/lib/navigation'

test('navigation helpers split available and upcoming sections correctly', () => {
  assert.equal(getAvailableNavItems(vendorNavItems).length, 8)
  assert.equal(getUpcomingNavItems(vendorNavItems).length, 0)
  assert.equal(getAvailableNavItems(adminNavItems).length, 13)
  assert.equal(getUpcomingNavItems(adminNavItems).length, 0)
})

test('buyer account only exposes implemented links as available', () => {
  const available = getAvailableNavItems(buyerAccountItems)
  const upcoming = getUpcomingNavItems(buyerAccountItems)

  assert.deepEqual(
    available.map(item => item.href),
    [
      '/cuenta/pedidos',
      '/cuenta/suscripciones',
      '/cuenta/direcciones',
      '/cuenta/favoritos',
      '/cuenta/perfil',
    ]
  )
  assert.deepEqual(upcoming.map(item => item.href), [])
})

test('buyer account metadata covers every account link to avoid runtime crashes in /cuenta', () => {
  assert.deepEqual(
    Object.keys(buyerAccountMeta).sort(),
    buyerAccountItems.map(item => item.href).sort()
  )
})

test('buyer account metadata exposes labelKey and descKey for every entry', () => {
  for (const [href, meta] of Object.entries(buyerAccountMeta)) {
    assert.ok('labelKey' in meta, `${href} is missing labelKey`)
    assert.ok('descKey' in meta, `${href} is missing descKey`)
    assert.ok(typeof meta.labelKey === 'string' && meta.labelKey.length > 0, `${href}.labelKey is empty`)
    assert.ok(typeof meta.descKey === 'string' && meta.descKey.length > 0, `${href}.descKey is empty`)
  }
})

test('buyerAccountMeta i18n keys exist in both locales', async () => {
  const { locales } = await import('@/i18n/locales')

  for (const meta of Object.values(buyerAccountMeta)) {
    const lk = meta.labelKey as string
    const dk = meta.descKey as string
    assert.ok(lk in locales.es, `Spanish locale missing key: ${lk}`)
    assert.ok(lk in locales.en, `English locale missing key: ${lk}`)
    assert.ok(dk in locales.es, `Spanish locale missing key: ${dk}`)
    assert.ok(dk in locales.en, `English locale missing key: ${dk}`)
  }
})
