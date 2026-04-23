import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('checkout flow shares a progress shell across address and payment screens', () => {
  const checkoutClient = readSource('../../src/components/buyer/CheckoutPageClient.tsx')
  const checkoutPage = readSource('../../src/app/(buyer)/checkout/page.tsx')
  const paymentPage = readSource('../../src/app/(buyer)/checkout/pago/page.tsx')
  const progress = readSource('../../src/components/checkout/CheckoutProgress.tsx')
  const es = readSource('../../src/i18n/locales/es.ts')
  const en = readSource('../../src/i18n/locales/en.ts')

  assert.match(checkoutClient, /CheckoutProgress/)
  assert.match(checkoutClient, /currentStep=\{1\}/)
  assert.match(paymentPage, /CheckoutProgress/)
  assert.match(paymentPage, /currentStep=\{2\}/)
  assert.doesNotMatch(checkoutPage, /CheckoutProgress/)
  assert.match(progress, /currentStep: 1 \| 2/)
  assert.match(es, /checkout\.flowSubtitle/)
  assert.match(es, /checkout\.flowStepAddress/)
  assert.match(es, /checkout\.flowStepPayment/)
  assert.match(en, /checkout\.flowSubtitle/)
  assert.match(en, /checkout\.flowStepAddress/)
  assert.match(en, /checkout\.flowStepPayment/)
})
