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

export function resolveCommissionRule({
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

export function resolveCommissionRate(input: ResolveCommissionRateInput) {
  const matchedRule = resolveCommissionRule(input)
  return matchedRule ? matchedRule.rate : input.vendorRate
}

export async function getCommissionRate(vendorId: string, categoryId?: string) {
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
