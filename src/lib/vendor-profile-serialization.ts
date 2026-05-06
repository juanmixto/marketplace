import type { Vendor } from '@/generated/prisma/client'
import { decryptVendorBankFields } from '@/domains/vendors'

export type VendorProfileItem = {
  id: string
  displayName: string
  description: string | null
  location: string | null
  category: Vendor['category']
  logo: string | null
  logoAlt: string | null
  coverImage: string | null
  coverImageAlt: string | null
  orderCutoffTime: string | null
  preparationDays: number | null
  iban: string | null
  bankAccountName: string | null
  stripeOnboarded: boolean
}

type VendorProfileSource = Pick<
  Vendor,
  | 'id'
  | 'displayName'
  | 'description'
  | 'location'
  | 'category'
  | 'logo'
  | 'logoAlt'
  | 'coverImage'
  | 'coverImageAlt'
  | 'orderCutoffTime'
  | 'preparationDays'
  | 'iban'
  | 'ibanEncrypted'
  | 'bankAccountName'
  | 'bankAccountNameEncrypted'
  | 'stripeOnboarded'
  | 'commissionRate'
  | 'avgRating'
  | 'totalReviews'
>

/**
 * Used by the vendor's OWN profile surface — decrypts the bank fields
 * back to plaintext so the existing form prefill works unchanged.
 * Admin code paths must NOT consume this (admin sees `ibanLast4`,
 * never plaintext). #1347.
 */
export function serializeVendorProfile(vendor: VendorProfileSource): VendorProfileItem {
  const { iban, bankAccountName } = decryptVendorBankFields(vendor)
  return {
    id: vendor.id,
    displayName: vendor.displayName,
    description: vendor.description,
    location: vendor.location,
    category: vendor.category,
    logo: vendor.logo,
    logoAlt: vendor.logoAlt,
    coverImage: vendor.coverImage,
    coverImageAlt: vendor.coverImageAlt,
    orderCutoffTime: vendor.orderCutoffTime,
    preparationDays: vendor.preparationDays,
    iban,
    bankAccountName,
    stripeOnboarded: vendor.stripeOnboarded,
  }
}
