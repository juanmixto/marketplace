import { db } from '@/lib/db'

export type PublicPromotion = {
  id: string
  name: string
  code: string | null
  kind: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING'
  value: number
  scope: 'PRODUCT' | 'VENDOR' | 'CATEGORY'
  minSubtotal: number | null
  startsAt: Date
  endsAt: Date
}

/**
 * Returns every non-archived, currently-in-window promotion that could
 * apply to the given product — either directly (PRODUCT), via its
 * vendor (VENDOR), or via its category (CATEGORY). Used by the public
 * product detail page to surface active offers to buyers during phase
 * 1 (checkout evaluation is still dormant, so this is informational
 * only).
 */
export async function getActivePromotionsForProduct({
  productId,
  vendorId,
  categoryId,
  now = new Date(),
}: {
  productId: string
  vendorId: string
  categoryId: string | null
  now?: Date
}): Promise<PublicPromotion[]> {
  const rows = await db.promotion.findMany({
    where: {
      vendorId,
      archivedAt: null,
      startsAt: { lte: now },
      endsAt: { gte: now },
      OR: [
        { scope: 'VENDOR' },
        { scope: 'PRODUCT', productId },
        ...(categoryId ? [{ scope: 'CATEGORY' as const, categoryId }] : []),
      ],
    },
    orderBy: [{ kind: 'asc' }, { value: 'desc' }],
    select: {
      id: true,
      name: true,
      code: true,
      kind: true,
      value: true,
      scope: true,
      minSubtotal: true,
      startsAt: true,
      endsAt: true,
    },
  })

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    code: r.code,
    kind: r.kind,
    value: Number(r.value),
    scope: r.scope,
    minSubtotal: r.minSubtotal !== null ? Number(r.minSubtotal) : null,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
  }))
}
