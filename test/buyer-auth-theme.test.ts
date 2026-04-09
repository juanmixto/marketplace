import test from 'node:test'
import assert from 'node:assert/strict'
import { buttonVariants } from '@/components/ui/button'
import { getStripeAppearance } from '@/components/checkout/StripeCheckoutForm'

test('buttonVariants keeps dark-friendly focus and hover tokens', () => {
  const primary = buttonVariants({ variant: 'primary' })
  const ghost = buttonVariants({ variant: 'ghost' })

  assert.match(primary, /dark:bg-emerald-500/)
  assert.match(primary, /focus-visible:ring-offset-\[var\(--background\)\]/)
  assert.match(ghost, /dark:hover:bg-\[var\(--surface-raised\)\]/)
})

test('getStripeAppearance maps theme tokens for light and dark modes', () => {
  const light = getStripeAppearance('light')
  const dark = getStripeAppearance('dark')

  assert.equal(light.theme, 'stripe')
  assert.equal(dark.theme, 'night')
  assert.equal(light.variables?.colorBackground, '#ffffff')
  assert.equal(dark.variables?.colorBackground, 'rgba(15, 23, 42, 0.72)')
  assert.equal(dark.variables?.colorPrimary, '#34d399')
})
