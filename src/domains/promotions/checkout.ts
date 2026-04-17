'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { getAvailableProductWhere } from '@/domains/catalog'
import { assertVariantPriceChargeable, getDefaultVariant, getSelectedVariant, getVariantAdjustedPrice, productRequiresVariantSelection } from '@/domains/catalog'
import {
  evaluatePromotions,
  type EvaluableCartLine,
} from '@/domains/promotions/evaluation'
import { countBuyerRedemptions, loadEvaluablePromotions } from '@/domains/promotions/loader'

const previewInputSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().min(1).optional(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
  code: z.string().trim().max(40).optional().nullable(),
  shippingCost: z.coerce.number().min(0).default(0),
})

export type PromotionPreviewInput = z.infer<typeof previewInputSchema>

export interface PromotionPreviewResult {
  ok: boolean
  subtotalDiscount: number
  shippingDiscount: number
  /** Per vendor: { promotionId, kind, discountAmount, shippingDiscount }. */
  appliedByVendor: Array<{
    vendorId: string
    promotionId: string
    kind: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING'
    discountAmount: number
    shippingDiscount: number
    name: string
    code: string | null
  }>
  /**
   * Per-line discount breakdown — lets the cart UI render the effective
   * price on each row. Keyed by productId+variantId so the cart can look
   * up its own lines. Distribution is proportional to each line's
   * contribution to the applicable subtotal.
   */
  lineDiscounts: Array<{
    productId: string
    variantId: string | null
    discount: number
  }>
  unknownCodes: string[]
}

/**
 * Server action that previews the discount for a cart without creating an
 * order. The checkout page calls this to show the buyer the savings before
 * they confirm. It is purely read-only — no DB writes, no side effects —
 * so rate limiting is not necessary.
 *
 * This mirrors the calculation done inside `createOrder` (see
 * `applyPromotionsToLines`) so both paths agree on the number before the
 * buyer is charged.
 */
export async function previewPromotionsForCart(
  input: PromotionPreviewInput
): Promise<PromotionPreviewResult> {
  const session = await getActionSession()
  const buyerId = session?.user.id ?? null

  const { items, code, shippingCost } = previewInputSchema.parse(input)

  const productIds = [...new Set(items.map(i => i.productId))]
  const products = await db.product.findMany({
    where: { id: { in: productIds }, ...getAvailableProductWhere() },
    include: { variants: { where: { isActive: true } } },
  })

  const lines: EvaluableCartLine[] = []
  // Parallel array — EvaluableCartLine stays variant-agnostic (the
  // evaluator doesn't care) but the preview consumer does, so we
  // track variantId alongside to key the per-line discount output.
  const lineVariantIds: Array<string | null> = []
  for (const item of items) {
    const product = products.find(p => p.id === item.productId)
    if (!product) continue

    const purchasableProduct = {
      basePrice: Number(product.basePrice),
      stock: product.stock,
      trackStock: product.trackStock,
      variants: product.variants.map(variant => ({
        id: variant.id,
        name: variant.name,
        priceModifier: Number(variant.priceModifier),
        stock: variant.stock,
        isActive: variant.isActive,
      })),
    }
    const fallbackVariant = getDefaultVariant(purchasableProduct)
    const selectedVariant =
      getSelectedVariant(purchasableProduct, item.variantId) ??
      (!item.variantId ? fallbackVariant : null)

    if (item.variantId && !selectedVariant) continue
    if (productRequiresVariantSelection(purchasableProduct) && !selectedVariant) continue

    const unitPrice = getVariantAdjustedPrice(Number(product.basePrice), selectedVariant)
    assertVariantPriceChargeable(unitPrice, product.name)

    lines.push({
      productId: product.id,
      vendorId: product.vendorId,
      categoryId: product.categoryId,
      quantity: item.quantity,
      unitPrice,
    })
    lineVariantIds.push(selectedVariant?.id ?? null)
  }

  if (lines.length === 0) {
    return {
      ok: false,
      subtotalDiscount: 0,
      shippingDiscount: 0,
      appliedByVendor: [],
      lineDiscounts: [],
      unknownCodes: [],
    }
  }

  const vendorIds = [...new Set(lines.map(l => l.vendorId))]
  const now = new Date()
  const promotions = await loadEvaluablePromotions({ vendorIds, code, now })
  const buyerRedemptions = buyerId
    ? await countBuyerRedemptions(
        buyerId,
        promotions.map(p => p.id)
      )
    : new Map<string, number>()

  const result = evaluatePromotions({
    lines,
    promotions,
    code,
    now,
    shippingCost,
    buyerRedemptionsByPromotionId: buyerRedemptions,
  })

  // Hydrate the applied rows with promotion name + code for UI display.
  const promoRows = await db.promotion.findMany({
    where: { id: { in: [...result.applied.values()].map(a => a.promotionId) } },
    select: { id: true, name: true, code: true },
  })
  const metaById = new Map(promoRows.map(r => [r.id, r]))

  // Distribute each applied promo's discount across the lines it
  // applied to, proportionally to each line's share of the applicable
  // subtotal. Mirrors how the order-creation path records the discount
  // on each vendorFulfillment line, so the cart UI shows the same per-
  // product cut the buyer will actually see on the receipt.
  const lineDiscountByIndex: number[] = lines.map(() => 0)
  for (const applied of result.applied.values()) {
    if (applied.discountAmount <= 0) continue
    const promo = promotions.find(p => p.id === applied.promotionId)
    if (!promo) continue

    const matchingIndices: number[] = []
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!
      if (line.vendorId !== applied.vendorId) continue
      if (promo.scope === 'PRODUCT' && line.productId !== promo.productId) continue
      if (promo.scope === 'CATEGORY' && line.categoryId !== promo.categoryId) continue
      matchingIndices.push(i)
    }
    const applicableSubtotal = matchingIndices.reduce(
      (acc, i) => acc + lines[i]!.unitPrice * lines[i]!.quantity,
      0
    )
    if (applicableSubtotal <= 0) continue

    for (const i of matchingIndices) {
      const lineTotal = lines[i]!.unitPrice * lines[i]!.quantity
      const share = (applied.discountAmount * lineTotal) / applicableSubtotal
      lineDiscountByIndex[i]! += Math.round(share * 100) / 100
    }
  }
  const lineDiscounts = lines
    .map((line, i) => ({
      productId: line.productId,
      variantId: lineVariantIds[i] ?? null,
      discount: lineDiscountByIndex[i] ?? 0,
    }))
    .filter(entry => entry.discount > 0)

  const appliedByVendor = [...result.applied.values()].map(applied => {
    const meta = metaById.get(applied.promotionId)
    return {
      vendorId: applied.vendorId,
      promotionId: applied.promotionId,
      kind: applied.kind,
      discountAmount: applied.discountAmount,
      shippingDiscount: applied.shippingDiscount,
      name: meta?.name ?? '',
      code: meta?.code ?? null,
    }
  })

  return {
    ok: true,
    subtotalDiscount: result.subtotalDiscount,
    shippingDiscount: result.shippingDiscount,
    appliedByVendor,
    lineDiscounts,
    unknownCodes: result.unknownCodes,
  }
}
