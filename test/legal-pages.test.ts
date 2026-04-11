import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('footer links to the legal pages that now exist', () => {
  const footer = readSource('../src/components/layout/Footer.tsx')
  const legalPages = [
    '../src/app/(public)/aviso-legal/page.tsx',
    '../src/app/(public)/cookies/page.tsx',
    '../src/app/(public)/terminos/page.tsx',
  ]

  assert.match(footer, /href: '\/aviso-legal'/)
  assert.match(footer, /href: '\/cookies'/)
  assert.match(footer, /href: '\/terminos'/)

  for (const path of legalPages) {
    const source = readSource(path)
    assert.match(source, /export const metadata: Metadata/)
    assert.match(source, /LegalPage/)
  }
})

test('public legal and transactional surfaces avoid marketplace.local placeholders', () => {
  const sources = [
    '../src/app/(public)/privacidad/page.tsx',
    '../src/app/(auth)/register/page.tsx',
    '../src/app/api/contacto/route.ts',
    '../src/emails/OrderConfirmation.tsx',
    '../src/emails/OrderShipped.tsx',
    '../src/lib/email.ts',
  ]

  for (const path of sources) {
    const source = readSource(path)
    assert.doesNotMatch(source, /marketplace\.local/)
  }
})

test('checkout demo notice is controlled by a prop and not hardcoded to always show', () => {
  const source = readSource('../src/components/buyer/CheckoutPageClient.tsx')

  assert.match(source, /showDemoNotice: boolean/)
  assert.match(source, /\{showDemoNotice && \(/)
  assert.doesNotMatch(source, /Modo demo activado[^]*Modo demo activado/)
})
