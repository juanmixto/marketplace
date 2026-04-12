/**
 * Pure helpers for vendor onboarding guards. Lives in its own file so the
 * logic can be unit-tested without pulling in server-action / Prisma /
 * next-auth modules.
 */

export const VENDOR_STRIPE_ONBOARDING_REQUIRED_MESSAGE =
  'Debes configurar Stripe para poder realizar esta acción'

export function assertVendorOnboarded(vendor: { stripeOnboarded: boolean }) {
  if (!vendor.stripeOnboarded) {
    throw new Error(VENDOR_STRIPE_ONBOARDING_REQUIRED_MESSAGE)
  }
}
