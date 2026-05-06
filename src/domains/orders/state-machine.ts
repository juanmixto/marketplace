import type { OrderStatus } from '@/generated/prisma/enums'

/**
 * Declarative Order state machine.
 *
 * Source of truth for `OrderStatus` transitions. Mirrors the diagram in
 * `docs/state-machines.md` § Order. Every server-side write that sets
 * `Order.status` MUST call `assertOrderTransition(from, to)` before the
 * Prisma update, and the audit script
 * `scripts/audit-order-status-transitions.mjs` enforces this in CI.
 *
 * Terminals (no outgoing edges): CANCELLED, DELIVERED, REFUNDED.
 *
 * Self-edges are allowed implicitly (Prisma `updateMany` with a
 * `where` guard often re-asserts the same status as part of a
 * partial-write idempotency check).
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['PAYMENT_CONFIRMED', 'CANCELLED'],
  PAYMENT_CONFIRMED: ['PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'],
  PROCESSING: ['PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'],
  PARTIALLY_SHIPPED: ['SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true
  return ORDER_TRANSITIONS[from].includes(to)
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`Invalid Order status transition: ${from} → ${to}`)
  }
}
