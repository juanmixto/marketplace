import { orderLineSnapshotSchema, type OrderLineSnapshot } from '@/types/order'

export type { OrderLineSnapshot } from '@/types/order'

export function parseOrderLineSnapshot(value: unknown): OrderLineSnapshot | null {
  const parsed = orderLineSnapshotSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
