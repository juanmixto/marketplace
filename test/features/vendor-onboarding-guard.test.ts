import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertVendorOnboarded,
  VENDOR_STRIPE_ONBOARDING_REQUIRED_MESSAGE,
} from '@/domains/vendors/onboarding'

test('assertVendorOnboarded is a no-op for onboarded vendors', () => {
  assert.doesNotThrow(() => assertVendorOnboarded({ stripeOnboarded: true }))
})

test('assertVendorOnboarded throws with the localized message for non-onboarded vendors', () => {
  assert.throws(
    () => assertVendorOnboarded({ stripeOnboarded: false }),
    (err: Error) => err.message === VENDOR_STRIPE_ONBOARDING_REQUIRED_MESSAGE
  )
})

test('VENDOR_STRIPE_ONBOARDING_REQUIRED_MESSAGE mentions Stripe in Spanish', () => {
  assert.match(VENDOR_STRIPE_ONBOARDING_REQUIRED_MESSAGE, /stripe/i)
})
