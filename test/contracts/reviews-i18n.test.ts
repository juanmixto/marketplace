import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('review i18n keys exist in both locales and differ per language', async () => {
  const { locales } = await import('@/i18n/locales')

  const keys = [
    'reviews.leave',
    'reviews.rate',
    'reviews.yourRating',
    'reviews.starAriaOne',
    'reviews.starAriaOther',
    'reviews.comment',
    'reviews.commentPlaceholder',
    'reviews.submit',
    'reviews.submitError',
    'reviews.totalOne',
    'reviews.totalOther',
    'reviews.empty',
    'reviews.valuationsOne',
    'reviews.valuationsOther',
    'reviews.vendorPage.title',
    'reviews.vendorPage.subtitle',
    'reviews.vendorPage.empty',
    'pendingReviews.bannerCountOne',
    'pendingReviews.bannerCountOther',
    'pendingReviews.badge',
    'pendingReviews.badgeCountOne',
    'pendingReviews.badgeCountOther',
    'pendingReviews.vendorCtaTitle',
    'pendingReviews.vendorCtaAction',
  ] as const

  for (const key of keys) {
    assert.ok(key in locales.es, `Spanish locale missing key: ${key}`)
    assert.ok(key in locales.en, `English locale missing key: ${key}`)
    const esValue = (locales.es as Record<string, string>)[key]
    const enValue = (locales.en as Record<string, string>)[key]
    assert.ok(esValue.length > 0, `Spanish value empty: ${key}`)
    assert.ok(enValue.length > 0, `English value empty: ${key}`)
    assert.notEqual(esValue, enValue, `Key ${key} has the same text in es and en`)
  }
})

test('plural keys use the {count} placeholder', async () => {
  const { locales } = await import('@/i18n/locales')
  const pluralKeys = [
    'reviews.totalOther',
    'reviews.valuationsOther',
    'reviews.starAriaOther',
    'pendingReviews.bannerCountOther',
    'pendingReviews.badgeCountOther',
  ] as const

  for (const key of pluralKeys) {
    const es = (locales.es as Record<string, string>)[key]
    const en = (locales.en as Record<string, string>)[key]
    assert.ok(es.includes('{count}'), `Spanish ${key} missing {count}`)
    assert.ok(en.includes('{count}'), `English ${key} missing {count}`)
  }
})

test('reviews.rate uses the {product} placeholder', async () => {
  const { locales } = await import('@/i18n/locales')
  assert.ok(locales.es['reviews.rate'].includes('{product}'))
  assert.ok(locales.en['reviews.rate'].includes('{product}'))
})

test('ReviewFormButton no longer hardcodes Spanish strings', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/components/reviews/ReviewFormButton.tsx'),
    'utf8'
  )
  // Hardcoded literals that existed before the i18n refactor
  assert.doesNotMatch(src, /'Dejar reseña'/)
  assert.doesNotMatch(src, /`Valorar \$/)
  assert.doesNotMatch(src, /'Tu valoración'/)
  assert.doesNotMatch(src, /'Publicar reseña'/)
  // And it must use the i18n hook
  assert.match(src, /useT\(\)/)
})
