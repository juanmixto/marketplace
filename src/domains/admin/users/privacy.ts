import type { Prisma, User, Vendor } from '@/generated/prisma/client'

export const ADMIN_USER_SUPPORT_USER_FIELDS = [
  'id',
  'email',
  'emailVerified',
  'firstName',
  'lastName',
  'image',
  'role',
  'isActive',
  'deletedAt',
  'consentAcceptedAt',
  'createdAt',
  'updatedAt',
] as const

export const ADMIN_USER_SUPPORT_VENDOR_FIELDS = [
  'id',
  'slug',
  'displayName',
  'status',
  'stripeOnboarded',
  'preferredShippingProvider',
  'createdAt',
  'updatedAt',
] as const

export const ADMIN_USER_PROHIBITED_USER_FIELDS = [
  'passwordHash',
  'passwordResetToken',
  'passwordResetExpires',
  'stripeCustomerId',
  'accounts',
  'sessions',
  'emailVerificationTokens',
  'passwordResetTokens',
  'twoFactor',
  'telegramLink',
  'telegramLinkTokens',
  'notificationPreferences',
  'notificationDeliveries',
] as const

export const ADMIN_USER_PROHIBITED_VENDOR_FIELDS = [
  'userId',
  'description',
  'logo',
  'coverImage',
  'location',
  'category',
  'commissionRate',
  'avgRating',
  'totalReviews',
  'orderCutoffTime',
  'preparationDays',
  'iban',
  'bankAccountName',
  'products',
  'fulfillments',
  'settlements',
  'reviews',
  'addresses',
  'promotions',
  'subscriptionPlans',
] as const

export const ADMIN_USER_SUPPORT_VENDOR_SELECT = {
  id: true,
  slug: true,
  displayName: true,
  status: true,
  stripeOnboarded: true,
  preferredShippingProvider: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.VendorSelect

export const ADMIN_USER_SUPPORT_USER_SELECT = {
  id: true,
  email: true,
  emailVerified: true,
  firstName: true,
  lastName: true,
  image: true,
  role: true,
  isActive: true,
  deletedAt: true,
  consentAcceptedAt: true,
  createdAt: true,
  updatedAt: true,
  vendor: {
    select: ADMIN_USER_SUPPORT_VENDOR_SELECT,
  },
} as const satisfies Prisma.UserSelect

export type AdminUserSupportVendorSource = Pick<
  Vendor,
  | 'id'
  | 'slug'
  | 'displayName'
  | 'status'
  | 'stripeOnboarded'
  | 'preferredShippingProvider'
  | 'createdAt'
  | 'updatedAt'
>

export type AdminUserSupportUserSource = Pick<
  User,
  | 'id'
  | 'email'
  | 'emailVerified'
  | 'firstName'
  | 'lastName'
  | 'image'
  | 'role'
  | 'isActive'
  | 'deletedAt'
  | 'consentAcceptedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  vendor?: AdminUserSupportVendorSource | null
}

export interface AdminUserSupportVendorView {
  id: string
  slug: string
  displayName: string
  status: Vendor['status']
  stripeOnboarded: boolean
  preferredShippingProvider: Vendor['preferredShippingProvider']
  createdAt: Date
  updatedAt: Date
}

export interface AdminUserSupportView {
  id: string
  email: string
  emailMasked: string
  emailVerified: Date | null
  firstName: string
  lastName: string
  image: string | null
  role: User['role']
  isActive: boolean
  deletedAt: Date | null
  consentAcceptedAt: Date | null
  createdAt: Date
  updatedAt: Date
  vendor: AdminUserSupportVendorView | null
}

/**
 * Masks an email address for low-risk contexts like audit notes or compact
 * chips. The full address stays available in the support read model; this
 * helper is for places where we want a recognizable but non-sensitive label.
 */
export function maskEmailAddress(email: string): string {
  const trimmed = email.trim()
  const atIndex = trimmed.indexOf('@')
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return '[redacted]'
  }

  const localPart = trimmed.slice(0, atIndex)
  const domainPart = trimmed.slice(atIndex + 1)
  const firstDotIndex = domainPart.indexOf('.')
  const host = firstDotIndex >= 0 ? domainPart.slice(0, firstDotIndex) : domainPart
  const suffix = firstDotIndex >= 0 ? domainPart.slice(firstDotIndex) : ''

  const maskedLocal = `${localPart.slice(0, 1)}***`
  const maskedHost = `${host.slice(0, 1)}***`

  return `${maskedLocal}@${maskedHost}${suffix}`
}

export function buildAdminUserSupportView(
  user: AdminUserSupportUserSource
): AdminUserSupportView {
  return {
    id: user.id,
    email: user.email,
    emailMasked: maskEmailAddress(user.email),
    emailVerified: user.emailVerified,
    firstName: user.firstName,
    lastName: user.lastName,
    image: user.image,
    role: user.role,
    isActive: user.isActive,
    deletedAt: user.deletedAt,
    consentAcceptedAt: user.consentAcceptedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    vendor: user.vendor
      ? {
          id: user.vendor.id,
          slug: user.vendor.slug,
          displayName: user.vendor.displayName,
          status: user.vendor.status,
          stripeOnboarded: user.vendor.stripeOnboarded,
          preferredShippingProvider: user.vendor.preferredShippingProvider,
          createdAt: user.vendor.createdAt,
          updatedAt: user.vendor.updatedAt,
        }
      : null,
  }
}
