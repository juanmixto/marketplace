import assert from 'node:assert/strict'
import test from 'node:test'
import { serializeVendorProfile } from '@/lib/vendor-profile-serialization'

function decimalLike(value: string) {
  return {
    toString() {
      return value
    },
  }
}

test('serializeVendorProfile strips Decimal-backed vendor fields from the client payload', () => {
  const profile = serializeVendorProfile({
    id: 'vendor-1',
    displayName: 'Huerta del Sur',
    description: 'Productos de temporada',
    location: 'Valencia',
    category: 'FARM',
    logo: 'https://example.com/logo.png',
    logoAlt: 'Logo de Huerta del Sur',
    coverImage: null,
    coverImageAlt: null,
    orderCutoffTime: '18:30',
    preparationDays: 2,
    iban: 'ES9121000418450200051332',
    bankAccountName: 'Huerta del Sur SL',
    stripeOnboarded: true,
    commissionRate: decimalLike('0.12') as never,
    avgRating: decimalLike('4.75') as never,
    totalReviews: 42,
  })

  assert.deepEqual(profile, {
    id: 'vendor-1',
    displayName: 'Huerta del Sur',
    description: 'Productos de temporada',
    location: 'Valencia',
    category: 'FARM',
    logo: 'https://example.com/logo.png',
    logoAlt: 'Logo de Huerta del Sur',
    coverImage: null,
    coverImageAlt: null,
    orderCutoffTime: '18:30',
    preparationDays: 2,
    iban: 'ES9121000418450200051332',
    bankAccountName: 'Huerta del Sur SL',
    stripeOnboarded: true,
  })
  assert.equal('commissionRate' in profile, false)
  assert.equal('avgRating' in profile, false)
})
