import test from 'node:test'
import assert from 'node:assert/strict'
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
