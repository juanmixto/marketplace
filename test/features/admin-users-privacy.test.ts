import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ADMIN_USER_PROHIBITED_USER_FIELDS,
  ADMIN_USER_PROHIBITED_VENDOR_FIELDS,
  ADMIN_USER_SUPPORT_USER_FIELDS,
  ADMIN_USER_SUPPORT_USER_SELECT,
  ADMIN_USER_SUPPORT_VENDOR_FIELDS,
  ADMIN_USER_SUPPORT_VENDOR_SELECT,
  buildAdminUserSupportView,
  maskEmailAddress,
} from '@/domains/admin/users/privacy'

test('admin users privacy policy only exposes whitelisted user fields', () => {
  assert.deepEqual(
    [...ADMIN_USER_SUPPORT_USER_FIELDS],
    [
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
      'lastLoginAt',
      'twoFactor',
      'createdAt',
      'updatedAt',
    ],
  )

  assert.deepEqual(
    [...ADMIN_USER_PROHIBITED_USER_FIELDS],
    [
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
    ],
  )

  assert.deepEqual(Object.keys(ADMIN_USER_SUPPORT_USER_SELECT).sort(), [
    'consentAcceptedAt',
    'createdAt',
    'deletedAt',
    'email',
    'emailVerified',
    'firstName',
    'image',
    'isActive',
    'lastName',
    'lastLoginAt',
    'role',
    'updatedAt',
    'twoFactor',
    'vendor',
    'id',
  ].sort())
})

test('admin users privacy policy only exposes whitelisted vendor fields', () => {
  assert.deepEqual(
    [...ADMIN_USER_SUPPORT_VENDOR_FIELDS],
    [
      'id',
      'slug',
      'displayName',
      'status',
      'stripeOnboarded',
      'preferredShippingProvider',
      'createdAt',
      'updatedAt',
    ],
  )

  assert.deepEqual(
    [...ADMIN_USER_PROHIBITED_VENDOR_FIELDS],
    [
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
    ],
  )

  assert.deepEqual(Object.keys(ADMIN_USER_SUPPORT_VENDOR_SELECT).sort(), [
    'createdAt',
    'displayName',
    'id',
    'preferredShippingProvider',
    'slug',
    'status',
    'stripeOnboarded',
    'updatedAt',
  ].sort())
})

test('buildAdminUserSupportView strips sensitive fields and keeps email masked', () => {
  const raw = {
    id: 'user-123',
    email: 'support.agent@example.com',
    emailVerified: new Date('2026-04-21T10:00:00.000Z'),
    firstName: 'Support',
    lastName: 'Agent',
    image: null,
    role: 'ADMIN_SUPPORT' as const,
    isActive: true,
    deletedAt: null,
    consentAcceptedAt: new Date('2026-01-10T12:00:00.000Z'),
    lastLoginAt: new Date('2026-04-20T09:15:00.000Z'),
    twoFactor: {
      enabledAt: new Date('2026-02-01T10:00:00.000Z'),
    },
    createdAt: new Date('2026-01-10T12:00:00.000Z'),
    updatedAt: new Date('2026-04-21T10:00:00.000Z'),
    passwordHash: 'super-secret-hash',
    passwordResetToken: 'reset-token',
    passwordResetExpires: new Date('2026-04-22T10:00:00.000Z'),
    stripeCustomerId: 'cus_123',
    vendor: {
      id: 'vendor-1',
      slug: 'fresh-producer',
      displayName: 'Fresh Producer',
      status: 'ACTIVE' as const,
      stripeOnboarded: true,
      preferredShippingProvider: 'SENDCLOUD' as const,
      createdAt: new Date('2026-01-11T12:00:00.000Z'),
      updatedAt: new Date('2026-04-21T10:00:00.000Z'),
      iban: 'ES9121000418450200051332',
      bankAccountName: 'Hidden Bank',
    },
  }

  const safe = buildAdminUserSupportView(raw)

  assert.equal(safe.email, 'support.agent@example.com')
  assert.equal(safe.emailMasked, 's***@e***.com')
  assert.equal((safe as unknown as Record<string, unknown>).passwordHash, undefined)
  assert.equal((safe as unknown as Record<string, unknown>).passwordResetToken, undefined)
  assert.equal((safe as unknown as Record<string, unknown>).stripeCustomerId, undefined)
  assert.equal(safe.lastLoginAt?.toISOString(), '2026-04-20T09:15:00.000Z')
  assert.ok(safe.twoFactorEnabledAt)
  assert.ok(safe.vendor)
  assert.equal(safe.vendor?.displayName, 'Fresh Producer')
  assert.equal((safe.vendor as unknown as Record<string, unknown>).iban, undefined)
  assert.equal((safe.vendor as unknown as Record<string, unknown>).bankAccountName, undefined)
})

test('maskEmailAddress keeps support-identifiable but non-sensitive labels', () => {
  assert.equal(maskEmailAddress('support@example.com'), 's***@e***.com')
  assert.equal(maskEmailAddress(' a@b.co '), 'a***@b***.co')
  assert.equal(maskEmailAddress('not-an-email'), '[redacted]')
})
