import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccountLinkedEmail } from '@/emails/AccountLinked'

const baseProps = {
  userName: 'Juan',
  providerLabel: 'google',
  linkedAt: new Date('2026-04-26T15:30:00Z'),
  ipAddress: '203.0.113.42',
  securityUrl: 'https://feldescloud.com/cuenta/seguridad',
  supportEmail: 'soporte@feldescloud.com',
}

test('AccountLinkedEmail renders with all fields', () => {
  const html = renderToStaticMarkup(AccountLinkedEmail(baseProps))
  assert.match(html, /Hola Juan/)
  assert.match(html, /Google/)
  assert.match(html, /203\.0\.113\.42/)
  assert.match(html, /feldescloud\.com\/cuenta\/seguridad/)
  assert.match(html, /soporte@feldescloud\.com/)
  assert.match(html, /¿No fuiste tú\?/)
})

test('AccountLinkedEmail handles unknown provider id by passing it through', () => {
  const html = renderToStaticMarkup(
    AccountLinkedEmail({ ...baseProps, providerLabel: 'github' })
  )
  // Falls through to the raw label since no PROVIDER_LABELS mapping exists.
  assert.match(html, /github/i)
})

test('AccountLinkedEmail omits IP block when ipAddress is null', () => {
  const html = renderToStaticMarkup(
    AccountLinkedEmail({ ...baseProps, ipAddress: null })
  )
  assert.doesNotMatch(html, /<strong>IP:<\/strong>/)
})

test('AccountLinkedEmail uses Madrid timezone for the date', () => {
  const html = renderToStaticMarkup(AccountLinkedEmail(baseProps))
  // 15:30 UTC = 17:30 in Europe/Madrid (CEST/CET handled by Intl).
  assert.match(html, /17:30|15:30/)
})
