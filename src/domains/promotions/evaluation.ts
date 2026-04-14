/**
 * Phase 2 — promotion evaluation engine.
 *
 * Pure, stateless, DB-less. Given a cart (vendor-scoped lines), a set of
 * candidate promotions (already filtered to vendors present in the cart and
 * pre-loaded from the DB), and an optional code entered by the buyer,
 * returns the best applicable promotion per vendor along with the computed
 * discount amount.
 *
 * Stacking rule (phase 1 RFC decision): at most ONE promotion per vendor.
 * The cheapest-eligible-for-the-buyer one wins, i.e. the one with the
 * biggest absolute discount. If the buyer typed a code, any promotion that
 * matches that code is considered alongside the automatic ones — it does
 * NOT exclude the automatic promotions, it just joins the pool for its
 * vendor. So if the buyer has a VENDOR-wide 5% auto-promo and enters a
 * 10% code for the same vendor, the 10% wins.
 *
 * FREE_SHIPPING is only applicable when the cart contains items from a
 * single vendor. In a multi-vendor cart we silently skip it — a proper
 * per-vendor shipping split lives in a follow-up RFC.
 */

export type PromotionKind = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING'
export type PromotionScope = 'PRODUCT' | 'VENDOR' | 'CATEGORY'

/** Minimal promotion shape used by the evaluator — DB rows are mapped to this. */
export interface EvaluablePromotion {
  id: string
  vendorId: string
  kind: PromotionKind
  scope: PromotionScope
  value: number
  code: string | null
  productId: string | null
  categoryId: string | null
  minSubtotal: number | null
  maxRedemptions: number | null
  redemptionCount: number
  perUserLimit: number | null
  startsAt: Date
  endsAt: Date
  archivedAt: Date | null
}

/** Minimal cart line shape used by the evaluator. */
export interface EvaluableCartLine {
  productId: string
  vendorId: string
  categoryId: string | null
  quantity: number
  unitPrice: number   // already includes tax — consistent with the rest of the codebase
}

export interface EvaluationContext {
  lines: EvaluableCartLine[]
  promotions: EvaluablePromotion[]
  code?: string | null
  now?: Date
  /** Per-promotion count of how many times this buyer has already redeemed it. */
  buyerRedemptionsByPromotionId?: Map<string, number>
  /** Shipping cost of the order — used only by FREE_SHIPPING promotions. */
  shippingCost?: number
}

export interface AppliedPromotion {
  promotionId: string
  vendorId: string
  kind: PromotionKind
  /** Amount in EUR subtracted from the vendor-scoped subtotal. Always ≥ 0. */
  discountAmount: number
  /** When FREE_SHIPPING applies, the shipping amount that should be nulled. */
  shippingDiscount: number
  reasonCode: string
}

export interface EvaluationResult {
  /** Per-vendor winning promotion. Vendors without any applicable promo are absent. */
  applied: Map<string, AppliedPromotion>
  /** Total EUR discount applied across all vendors (sum of discountAmount). */
  subtotalDiscount: number
  /** Total EUR shipping discount (0 or the full shipping cost today). */
  shippingDiscount: number
  /** Codes the buyer entered that matched no eligible promotion — for UI feedback. */
  unknownCodes: string[]
}

/**
 * Returns the per-vendor subtotal of the cart (sum of unitPrice * quantity).
 * Exported because the caller may need it for UX (e.g. showing a min
 * subtotal hint).
 */
export function vendorSubtotals(
  lines: EvaluableCartLine[]
): Map<string, number> {
  const subtotals = new Map<string, number>()
  for (const line of lines) {
    const current = subtotals.get(line.vendorId) ?? 0
    subtotals.set(line.vendorId, round2(current + line.unitPrice * line.quantity))
  }
  return subtotals
}

/** Rounds a number to 2 decimal places, avoiding FP noise. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Returns `true` iff the promotion is time-eligible at the given moment and
 * has not been archived, exhausted, or otherwise knocked out by a
 * non-cart-specific check. Cart-specific checks (scope, minSubtotal, code
 * gating) live further down in `evaluateVendorPromotion`.
 */
function isTimeWindowValid(promo: EvaluablePromotion, now: Date): boolean {
  if (promo.archivedAt !== null) return false
  if (now.getTime() < promo.startsAt.getTime()) return false
  if (now.getTime() > promo.endsAt.getTime()) return false
  return true
}

function isRedemptionBudgetAvailable(
  promo: EvaluablePromotion,
  buyerRedemptions: number
): boolean {
  if (
    promo.maxRedemptions !== null &&
    promo.redemptionCount >= promo.maxRedemptions
  ) {
    return false
  }
  if (promo.perUserLimit !== null && buyerRedemptions >= promo.perUserLimit) {
    return false
  }
  return true
}

/** Picks the lines this promotion applies to, given its scope. */
function matchesScope(
  promo: EvaluablePromotion,
  vendorLines: EvaluableCartLine[]
): EvaluableCartLine[] {
  if (promo.scope === 'VENDOR') return vendorLines
  if (promo.scope === 'PRODUCT') {
    return vendorLines.filter(l => l.productId === promo.productId)
  }
  if (promo.scope === 'CATEGORY') {
    return vendorLines.filter(l => l.categoryId === promo.categoryId)
  }
  return []
}

/** Sum of unitPrice * quantity for a given set of lines. */
function sumLines(lines: EvaluableCartLine[]): number {
  return round2(lines.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0))
}

/** Computes the raw discount a promotion would apply against a subtotal. */
function computeDiscount(
  promo: EvaluablePromotion,
  applicableSubtotal: number,
  shippingCost: number
): { discount: number; shippingDiscount: number } {
  if (applicableSubtotal <= 0 && promo.kind !== 'FREE_SHIPPING') {
    return { discount: 0, shippingDiscount: 0 }
  }

  switch (promo.kind) {
    case 'PERCENTAGE': {
      // value is 0..100; bound by the applicable subtotal to avoid rounding over-discount
      const raw = (applicableSubtotal * promo.value) / 100
      return { discount: round2(Math.min(raw, applicableSubtotal)), shippingDiscount: 0 }
    }
    case 'FIXED_AMOUNT': {
      // Never discount more than the applicable subtotal.
      return { discount: round2(Math.min(promo.value, applicableSubtotal)), shippingDiscount: 0 }
    }
    case 'FREE_SHIPPING': {
      return { discount: 0, shippingDiscount: round2(shippingCost) }
    }
  }
}

/** Core evaluation pass per vendor. */
function evaluateVendorPromotion(
  vendorId: string,
  vendorLines: EvaluableCartLine[],
  candidates: EvaluablePromotion[],
  now: Date,
  buyerRedemptionsByPromotionId: Map<string, number>,
  shippingCost: number,
  isSingleVendorCart: boolean
): AppliedPromotion | null {
  const vendorSubtotal = sumLines(vendorLines)
  let best: AppliedPromotion | null = null

  for (const promo of candidates) {
    if (promo.vendorId !== vendorId) continue
    if (!isTimeWindowValid(promo, now)) continue
    if (
      !isRedemptionBudgetAvailable(
        promo,
        buyerRedemptionsByPromotionId.get(promo.id) ?? 0
      )
    ) continue

    // FREE_SHIPPING is skipped in multi-vendor carts — see file header.
    if (promo.kind === 'FREE_SHIPPING' && !isSingleVendorCart) continue

    if (promo.minSubtotal !== null && vendorSubtotal < promo.minSubtotal) {
      continue
    }

    const applicableLines = matchesScope(promo, vendorLines)
    if (applicableLines.length === 0) continue

    const applicableSubtotal = sumLines(applicableLines)
    const { discount, shippingDiscount } = computeDiscount(
      promo,
      applicableSubtotal,
      shippingCost
    )

    if (discount <= 0 && shippingDiscount <= 0) continue

    const totalSaving = discount + shippingDiscount
    const bestSaving = best ? best.discountAmount + best.shippingDiscount : -1

    if (totalSaving > bestSaving) {
      best = {
        promotionId: promo.id,
        vendorId,
        kind: promo.kind,
        discountAmount: discount,
        shippingDiscount,
        reasonCode: promo.code ? 'code' : 'auto',
      }
    }
  }

  return best
}

/**
 * Entry point — runs the evaluation pass across every vendor in the cart
 * and returns the aggregated result.
 */
export function evaluatePromotions(ctx: EvaluationContext): EvaluationResult {
  const now = ctx.now ?? new Date()
  const shippingCost = ctx.shippingCost ?? 0
  const buyerRedemptions = ctx.buyerRedemptionsByPromotionId ?? new Map<string, number>()
  const code = ctx.code ? ctx.code.trim().toUpperCase() : null

  const vendorIds = new Set<string>()
  for (const line of ctx.lines) vendorIds.add(line.vendorId)
  const isSingleVendorCart = vendorIds.size === 1

  // Filter the candidate pool: a promotion with a code is only considered
  // if the buyer typed that code. A promotion without a code is always a
  // candidate.
  const candidates = ctx.promotions.filter(p => {
    if (p.code === null) return true
    return code !== null && p.code === code
  })

  const applied = new Map<string, AppliedPromotion>()
  for (const vendorId of vendorIds) {
    const vendorLines = ctx.lines.filter(l => l.vendorId === vendorId)
    const winner = evaluateVendorPromotion(
      vendorId,
      vendorLines,
      candidates,
      now,
      buyerRedemptions,
      shippingCost,
      isSingleVendorCart
    )
    if (winner) applied.set(vendorId, winner)
  }

  let subtotalDiscount = 0
  let shippingDiscount = 0
  for (const a of applied.values()) {
    subtotalDiscount += a.discountAmount
    shippingDiscount += a.shippingDiscount
  }

  // Unknown codes — only meaningful when the buyer actually typed one. A
  // code is reported as "unknown" when the candidate pool does not contain
  // any promotion with that code for any of the vendors in the cart. A code
  // that matches an existing promotion but loses to a better auto-promo is
  // silently dropped: the buyer gets the best deal either way.
  const unknownCodes: string[] = []
  if (code !== null) {
    const codeMatchedAnyVendor = ctx.promotions.some(p => p.code === code)
    if (!codeMatchedAnyVendor) unknownCodes.push(code)
  }

  return {
    applied,
    subtotalDiscount: round2(subtotalDiscount),
    shippingDiscount: round2(shippingDiscount),
    unknownCodes,
  }
}
