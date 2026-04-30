import type { Vendor } from '@/generated/prisma/client'

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
  | 'bankAccountName'
  | 'stripeOnboarded'
  | 'commissionRate'
  | 'avgRating'
  | 'totalReviews'
>

export function serializeVendorProfile(vendor: VendorProfileSource): VendorProfileItem {
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
    iban: vendor.iban,
    bankAccountName: vendor.bankAccountName,
    stripeOnboarded: vendor.stripeOnboarded,
  }
}
