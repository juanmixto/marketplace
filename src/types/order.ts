/**
 * Back-compat re-export. The canonical home of these schemas is
 * src/shared/types/snapshots.ts (Phase 5 of contract-hardening).
 * Existing imports of `@/types/order` keep working unchanged.
 */
export {
  orderLineSnapshotSchema,
  orderAddressSnapshotSchema,
  parseOrderAddressSnapshot,
  paymentConfirmedEventPayloadSchema,
  paymentFailedEventPayloadSchema,
  paymentMismatchEventPayloadSchema,
  type OrderLineSnapshot,
  type OrderAddressSnapshot,
  type PaymentConfirmedEventPayload,
  type PaymentFailedEventPayload,
  type PaymentMismatchEventPayload,
} from '@/shared/types/snapshots'
