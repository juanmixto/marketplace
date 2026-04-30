/**
 * Issue #590: explicit DTOs for public catalog reads.
 *
 * Kept in a dependency-free module so the contract test
 * (`test/integration/public-catalog-dto.test.ts`) can import the
 * select maps without pulling the Prisma client or the request
 * environment through `@/lib/db`.
 *
 * Prisma `include` without `select` pulls the whole row — including
 * fields that are safe on admin/vendor surfaces but MUST NOT leak to
 * buyers or anonymous visitors. For Vendor that set is:
 *   - iban, bankAccountName      → payment PII
 *   - stripeAccountId, stripeOnboarded → payout wiring
 *   - commissionRate             → business-sensitive pricing
 *   - userId                     → internal join, not needed publicly
 *   - preferredShippingProvider  → internal operational config
 *   - status                     → we already filter to ACTIVE
 *
 * Every field on these DTOs has a reason to be public. Adding one is a
 * security decision — update the companion test alongside the change.
 */
export const PUBLIC_VENDOR_SELECT = {
  id: true,
  slug: true,
  displayName: true,
  description: true,
  logo: true,
  // #1049 — vendor-supplied alt text. Public-safe: the vendor wrote it
  // for buyers to see. Empty / null falls back to displayName at render.
  logoAlt: true,
  coverImage: true,
  coverImageAlt: true,
  location: true,
  category: true,
  avgRating: true,
  totalReviews: true,
  orderCutoffTime: true,
  preparationDays: true,
  createdAt: true,
} as const

// ProductVariant: `sku` is an internal operational code (used by the
// vendor panel and Sendcloud label workflow). Keep it off the public
// catalog surface; buyers pick a variant by id/name.
export const PUBLIC_VARIANT_SELECT = {
  id: true,
  name: true,
  priceModifier: true,
  stock: true,
  isActive: true,
} as const
