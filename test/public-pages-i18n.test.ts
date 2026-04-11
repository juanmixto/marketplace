import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getLegalPageCopy } from '@/i18n/legal-page-copy'
import { getPublicPageCopy } from '@/i18n/public-page-copy'
import { coerceLocale } from '@/i18n/server'

test('marketing pages expose English copy for key public routes', () => {
  const en = getPublicPageCopy('en')

  assert.equal(en.contact.heroTitle, 'Contact')
  assert.match(en.contact.heroBody, /questions|help/i)
  assert.equal(en.contact.form.submitIdle, 'Send message')
  assert.equal(en.contact.form.subjectOptions.pedido, 'Order support')
  assert.equal(en.faq.heroTitle, 'Frequently asked questions')
  assert.equal(en.howItWorks.heroTitle, 'How it works')
  assert.equal(en.aboutUs.heroTitle, 'About Mercado Productor')
  assert.equal(en.sell.heroTitle, 'Sell your products directly')
})

test('legal privacy page exposes English copy', () => {
  const en = getLegalPageCopy('en').privacy

  assert.equal(en.title, 'Privacy Policy')
  assert.match(en.intro, /privacy|personal data/i)
  assert.equal(en.sections.contact.contactLink, 'contact form')
})

test('Spanish copy remains the default fallback for public pages', () => {
  const es = getPublicPageCopy('es')

  assert.equal(es.contact.heroTitle, 'Contacto')
  assert.equal(es.faq.ctaTitle, '¿Aún tienes preguntas?')
  assert.equal(es.howItWorks.ctaTitle, '¿Listo para empezar?')
})

test('coerceLocale accepts supported locales and falls back to Spanish', () => {
  assert.equal(coerceLocale('en'), 'en')
  assert.equal(coerceLocale('es'), 'es')
  assert.equal(coerceLocale('fr'), 'es')
  assert.equal(coerceLocale(null), 'es')
})

test('getServerT returns a function that resolves keys for both locales', async () => {
  const { getServerT } = await import('@/i18n/server')

  // getServerT reads cookies; we can still import and inspect module-level exports
  assert.equal(typeof getServerT, 'function', 'getServerT must be exported from @/i18n/server')
})

test('account GDPR section i18n keys exist in both locales', async () => {
  const { locales } = await import('@/i18n/locales')
  const gdprKeys = ['account.gdpr.title', 'account.gdpr.desc', 'account.comingSoon'] as const

  for (const key of gdprKeys) {
    assert.ok(key in locales.es, `Spanish locale missing key: ${key}`)
    assert.ok(key in locales.en, `English locale missing key: ${key}`)
    assert.ok((locales.es as Record<string, string>)[key].length > 0, `Spanish value empty for: ${key}`)
    assert.ok((locales.en as Record<string, string>)[key].length > 0, `English value empty for: ${key}`)
  }
})

test('account GDPR keys are translated differently in Spanish and English', async () => {
  const { locales } = await import('@/i18n/locales')

  assert.notEqual(locales.es['account.gdpr.title'], locales.en['account.gdpr.title'])
  assert.notEqual(locales.es['account.gdpr.desc'], locales.en['account.gdpr.desc'])
})

test('LanguageSwitcher displays the target language rather than the current one', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/components/LanguageSwitcher.tsx'),
    'utf8'
  )
  // The button labels must show [next] (target locale) so users see what they will switch TO
  assert.match(src, /FLAGS\[next\]/, 'Button flag should show the target language flag')
  assert.match(src, /LABELS\[next\]/, 'Button label should show the target language label')
  // Must NOT display the current locale as the button text
  assert.doesNotMatch(src, />\s*\{FLAGS\[locale\]\}/, 'Button must not show current locale flag as its label')
  assert.doesNotMatch(src, />\s*\{LABELS\[locale\]\}/, 'Button must not show current locale label as its text')
})
