export interface CommissionRuleLike {
  id?: string
  vendorId?: string | null
  categoryId?: string | null
  type: 'PERCENTAGE' | 'FIXED' | 'TIERED'
  rate: number
  isActive: boolean
}

export interface ResolveCommissionRateInput {
  vendorId: string
  categoryId?: string | null
  vendorRate: number
  rules: CommissionRuleLike[]
}

function resolveCommissionRule({
  vendorId,
  categoryId,
  rules,
}: {
  vendorId: string
  categoryId?: string | null
  rules: CommissionRuleLike[]
}) {
  const activeRules = rules.filter(rule => rule.isActive)
  const vendorRule = activeRules.find(rule => rule.vendorId === vendorId)
  if (vendorRule) return vendorRule

  if (categoryId) {
    const categoryRule = activeRules.find(rule => rule.categoryId === categoryId)
    if (categoryRule) return categoryRule
  }

  return null
}

/**
 * Pure resolver: given pre-loaded rules + vendor rate, decide the rate
 * for a (vendorId, categoryId) pair. Used by callers that already loaded
 * the rule set (e.g. createOrder's per-line Connect-fee calculation in
 * #1162 H-6, where loading rules per line would N+1 the checkout).
 */
export function resolveCommissionRate(input: ResolveCommissionRateInput) {
  const matchedRule = resolveCommissionRule(input)
  return matchedRule ? matchedRule.rate : input.vendorRate
}

/**
 * One-shot loader for `resolveCommissionRate` callers that need to
 * resolve rates for many (categoryId) pairs sharing a single vendor.
 * Returns the vendor's base rate plus the rule set covering the vendor
 * AND the supplied categoryIds in one round-trip — so a multi-line
 * cart resolves in O(1) DB queries instead of O(lines).
 *
 * Pass an empty `categoryIds` array to load only the vendor-level rule
 * (single-line case) — the implementation skips the category branch of
 * the OR.
 */
export async function loadCommissionResolverForVendor(
  vendorId: string,
  categoryIds: Array<string | null | undefined>,
): Promise<Omit<ResolveCommissionRateInput, 'vendorId' | 'categoryId'>> {
  const { db } = await import('@/lib/db')
  const distinctCategoryIds = [...new Set(
    categoryIds.filter((c): c is string => typeof c === 'string' && c.length > 0)
  )]

  const [vendor, rules] = await Promise.all([
    db.vendor.findUnique({
      where: { id: vendorId },
      select: { commissionRate: true },
    }),
    db.commissionRule.findMany({
      where: {
        isActive: true,
        OR: [
          { vendorId },
          ...(distinctCategoryIds.length > 0
            ? [{ categoryId: { in: distinctCategoryIds } }]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        vendorId: true,
        categoryId: true,
        type: true,
        rate: true,
        isActive: true,
      },
    }),
  ])

  if (!vendor) throw new Error('Productor no encontrado')

  return {
    vendorRate: Number(vendor.commissionRate),
    rules: rules.map(rule => ({
      ...rule,
      rate: Number(rule.rate),
    })),
  }
}

export async function resolveEffectiveCommissionRate(
  vendorId: string,
  categoryId?: string,
  injected?: Omit<ResolveCommissionRateInput, 'vendorId' | 'categoryId'>
) {
  if (injected) {
    return resolveCommissionRate({
      vendorId,
      categoryId,
      vendorRate: injected.vendorRate,
      rules: injected.rules,
    })
  }

  const { db } = await import('@/lib/db')

  const [vendor, rules] = await Promise.all([
    db.vendor.findUnique({
      where: { id: vendorId },
      select: { commissionRate: true },
    }),
    db.commissionRule.findMany({
      where: {
        isActive: true,
        OR: [
          { vendorId },
          ...(categoryId ? [{ categoryId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        vendorId: true,
        categoryId: true,
        type: true,
        rate: true,
        isActive: true,
      },
    }),
  ])

  if (!vendor) throw new Error('Productor no encontrado')

  return resolveCommissionRate({
    vendorId,
    categoryId,
    vendorRate: Number(vendor.commissionRate),
    rules: rules.map(rule => ({
      ...rule,
      rate: Number(rule.rate),
    })),
  })
}

export function calculateCommissionAmount({
  grossSales,
  commissionType,
  commissionRate,
}: {
  grossSales: number
  commissionType: CommissionRuleLike['type']
  commissionRate: number
}) {
  if (commissionType === 'FIXED') return roundCurrency(commissionRate)
  return roundCurrency(grossSales * commissionRate)
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}
