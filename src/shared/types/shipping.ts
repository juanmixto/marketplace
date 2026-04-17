/**
 * Single source of truth for the shipping-provider discriminator.
 * Phase 5 of the contract-hardening plan.
 *
 * Previously this lived as a literal type ('SENDCLOUD') in
 * src/domains/shipping/domain/types.ts AND as a Prisma enum at the same
 * time, so adding a provider in one place silently diverged from the
 * other. This re-export collapses them.
 */
export { ShippingProviderCode } from '@/generated/prisma/enums'
