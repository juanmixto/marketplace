import type { VendorStatus } from '@/generated/prisma/enums'

/**
 * Whether a vendor in the given lifecycle state may progress fulfillments
 * (confirm, prepare label, mark shipped, etc.). Catalog visibility is
 * gated separately by `getAvailableProductWhere`.
 *
 * #1334: SUSPENDED_TEMP / SUSPENDED_PERM cannot operate. APPLYING /
 * PENDING_DOCS shouldn't have fulfillments yet, but we deny defensively
 * in case data drifts. REJECTED is terminal and identical.
 */
export function canVendorOperateFulfillments(status: VendorStatus): boolean {
  return status === 'ACTIVE'
}

export const VENDOR_SUSPENDED_MESSAGE =
  'Cuenta de productor suspendida. Contacta con soporte para resolver la incidencia.'
