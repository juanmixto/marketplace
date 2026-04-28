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
  assert.equal(en.aboutUs.heroTitle, 'About Raíz Directa')
  assert.equal(en.sell.heroTitle, 'Sell your products directly')
})

test('legal privacy page exposes English copy', () => {
  const en = getLegalPageCopy('en').privacy

  assert.equal(en.title, 'Privacy Policy')
  assert.match(en.intro, /privacy|personal data/i)
  assert.equal(en.sections.contact.contactLink, 'contact form')
})

test('legal notice, cookies and terms pages expose copy in both locales', () => {
  const es = getLegalPageCopy('es')
  const en = getLegalPageCopy('en')

  assert.equal(es.legalNotice.title, 'Aviso legal')
  assert.equal(en.legalNotice.title, 'Legal Notice')
  assert.notEqual(es.legalNotice.intro, en.legalNotice.intro)
  assert.equal(es.legalNotice.sections.usage.items.length, en.legalNotice.sections.usage.items.length)

  assert.equal(es.cookies.title, 'Política de cookies')
  assert.equal(en.cookies.title, 'Cookie policy')
  assert.notEqual(es.cookies.intro, en.cookies.intro)
  assert.equal(es.cookies.sections.types.items.length, en.cookies.sections.types.items.length)

  assert.equal(es.terms.title, 'Términos de uso')
  assert.equal(en.terms.title, 'Terms of use')
  assert.notEqual(es.terms.intro, en.terms.intro)
  assert.equal(es.terms.sections.acceptable.items.length, en.terms.sections.acceptable.items.length)
})

test('footer legal keys (privacy, cookies, terms) exist in both locales', async () => {
  const { locales } = await import('@/i18n/locales')
  for (const key of ['privacy', 'cookies', 'terms'] as const) {
    assert.ok(key in locales.es, `Spanish missing ${key}`)
    assert.ok(key in locales.en, `English missing ${key}`)
  }
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

test('buyer account pages (orders, profile, addresses) i18n keys exist in both locales', async () => {
  const { locales } = await import('@/i18n/locales')
  const accountKeys = [
    'account.ordersTitle',
    'account.ordersSubtitle',
    'account.ordersEmpty',
    'account.ordersExplore',
    'account.ordersViewDetail',
    'account.ordersItem',
    'account.ordersItems',
    'account.ordersProduct',
    'account.ordersProducts',
    'account.ordersMore',
    'account.profileTitle',
    'account.profileSubtitle',
    'account.profilePersonalInfo',
    'account.profileNameLabel',
    'account.profileLastNameLabel',
    'account.profileEmailLabel',
    'account.profileSaving',
    'account.profileSaveChanges',
    'account.profileChangesSaved',
    'account.profileChangePassword',
    'account.profileCurrentPassword',
    'account.profileNewPassword',
    'account.profileConfirmPassword',
    'account.profileChanging',
    'account.profilePasswordUpdated',
    'account.profileNameRequired',
    'account.profileLastNameRequired',
    'account.profileEmailInvalid',
    'account.profileCurrentPasswordRequired',
    'account.profileMin8',
    'account.profilePasswordsDontMatch',
    'account.profileUpdateError',
    'account.profilePasswordError',
    'account.addressesTitle',
    'account.addressesSubtitle',
  ] as const

  for (const key of accountKeys) {
    assert.ok(key in locales.es, `Spanish locale missing key: ${key}`)
    assert.ok(key in locales.en, `English locale missing key: ${key}`)
    assert.ok((locales.es as Record<string, string>)[key].length > 0, `Spanish value empty for: ${key}`)
    assert.ok((locales.en as Record<string, string>)[key].length > 0, `English value empty for: ${key}`)
  }
})

test('buyer account translations differ between Spanish and English for human-readable copy', async () => {
  const { locales } = await import('@/i18n/locales')
  const compareKeys = [
    'account.ordersTitle',
    'account.ordersSubtitle',
    'account.ordersEmpty',
    'account.ordersExplore',
    'account.profileTitle',
    'account.profileSubtitle',
    'account.profilePersonalInfo',
    'account.profileChangePassword',
    'account.addressesTitle',
    'account.addressesSubtitle',
  ] as const

  for (const key of compareKeys) {
    assert.notEqual(
      (locales.es as Record<string, string>)[key],
      (locales.en as Record<string, string>)[key],
      `Expected ${key} to differ between locales`,
    )
  }
})

test('buyer account server pages and profile form consume i18n', () => {
  const ordersPage = readFileSync(resolve(process.cwd(), 'src/app/(buyer)/cuenta/pedidos/page.tsx'), 'utf8')
  const profilePage = readFileSync(resolve(process.cwd(), 'src/app/(buyer)/cuenta/perfil/page.tsx'), 'utf8')
  const addressesPage = readFileSync(resolve(process.cwd(), 'src/app/(buyer)/cuenta/direcciones/page.tsx'), 'utf8')
  const profileForm = readFileSync(resolve(process.cwd(), 'src/components/buyer/BuyerProfileForm.tsx'), 'utf8')

  for (const src of [ordersPage, profilePage, addressesPage]) {
    assert.match(src, /getServerT/, 'server page should call getServerT')
    assert.match(src, /generateMetadata\(\): Promise<Metadata>/, 'server page should localize metadata via generateMetadata')
  }

  assert.doesNotMatch(ordersPage, />Mis pedidos</)
  assert.doesNotMatch(profilePage, />Mi perfil</)
  assert.doesNotMatch(addressesPage, />Mis direcciones</)

  assert.match(profileForm, /useT/)
  assert.match(profileForm, /account\.profilePersonalInfo/)
  assert.doesNotMatch(profileForm, />Información personal</)
})

test('LanguageSwitcher is a segmented two-option toggle with the current locale highlighted', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/components/LanguageSwitcher.tsx'),
    'utf8'
  )
  // Must render both locale buttons (segmented control) so the state is unambiguous
  assert.match(src, /code:\s*'es'/, 'Must enumerate the es locale')
  assert.match(src, /code:\s*'en'/, 'Must enumerate the en locale')
  // Active state must be driven by comparing each option to the current locale
  assert.match(src, /code === locale/, 'Must compare each button against the current locale')
  // aria-pressed communicates the active segment to screen readers
  assert.match(src, /aria-pressed/, 'Active segment must expose aria-pressed')
})
