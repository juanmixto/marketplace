import type { ShipmentStatusInternal } from './types'

const RANK: Record<ShipmentStatusInternal, number> = {
  DRAFT: 0,
  LABEL_REQUESTED: 1,
  LABEL_CREATED: 2,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
  EXCEPTION: 3,
  CANCELLED: 6,
  FAILED: 6,
}

const TERMINAL: ShipmentStatusInternal[] = ['DELIVERED', 'CANCELLED', 'FAILED']

export function isTerminal(status: ShipmentStatusInternal): boolean {
  return TERMINAL.includes(status)
}

/**
 * Whether transitioning from `from` to `to` is acceptable.
 * Rules:
 *  - Never from a terminal state.
 *  - Never backwards in rank, except EXCEPTION ↔ IN_TRANSIT recovery.
 *  - Jumps forward are allowed (webhooks may arrive out of order).
 */
export function isValidTransition(
  from: ShipmentStatusInternal,
  to: ShipmentStatusInternal,
): boolean {
  if (from === to) return false
  if (isTerminal(from)) return false

  if (from === 'EXCEPTION' && (to === 'IN_TRANSIT' || to === 'OUT_FOR_DELIVERY')) {
    return true
  }
  if (to === 'EXCEPTION') return true
  if (to === 'CANCELLED' || to === 'FAILED') return true

  return RANK[to] > RANK[from]
}
