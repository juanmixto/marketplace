'use server'

import { UserRole } from '@/generated/prisma/enums'
import { db } from '@/lib/db'
import { z } from 'zod'
import { setMarketplaceConfig } from '@/lib/config'
import { createAuditLog, getAuditRequestIp, mutateWithAudit, type AuditValue } from '@/lib/audit'
import { requireAdmin, requireFinanceAdmin, requireOpsAdmin } from '@/lib/auth-guard'
import { hasRole } from '@/lib/roles'
import { revalidateCatalogExperience, safeRevalidatePath } from '@/lib/revalidate'
import { assertVendorOnboarded } from '@/domains/vendors/onboarding'

function getVendorAuditSnapshot(vendor: {
  id: string
  status: string
  displayName: string
  location: string | null
  stripeOnboarded: boolean
  commissionRate: { toString(): string } | number
}) {
  return {
    id: vendor.id,
    status: vendor.status,
    displayName: vendor.displayName,
    location: vendor.location,
    stripeOnboarded: vendor.stripeOnboarded,
    commissionRate: Number(vendor.commissionRate),
  }
}

function getProductAuditSnapshot(product: {
  id: string
  name: string
  status: string
  stock: number
  vendorId: string
  categoryId: string | null
  rejectionNote: string | null
  basePrice: { toString(): string } | number
}) {
  return {
    id: product.id,
    name: product.name,
    status: product.status,
    stock: product.stock,
    vendorId: product.vendorId,
    categoryId: product.categoryId,
    rejectionNote: product.rejectionNote,
    basePrice: Number(product.basePrice),
  }
}

function getSettlementAuditSnapshot(settlement: {
  id: string
  vendorId: string
  status: string
  paidAt: Date | null
  grossSales: { toString(): string } | number
  commissions: { toString(): string } | number
  refunds: { toString(): string } | number
  adjustments: { toString(): string } | number
  netPayable: { toString(): string } | number
  periodFrom: Date
  periodTo: Date
}) {
  return {
    id: settlement.id,
    vendorId: settlement.vendorId,
    status: settlement.status,
    paidAt: settlement.paidAt?.toISOString() ?? null,
    grossSales: Number(settlement.grossSales),
    commissions: Number(settlement.commissions),
    refunds: Number(settlement.refunds),
    adjustments: Number(settlement.adjustments),
    netPayable: Number(settlement.netPayable),
    periodFrom: settlement.periodFrom.toISOString(),
    periodTo: settlement.periodTo.toISOString(),
  }
}

// ─── Vendor moderation ────────────────────────────────────────────────────────

/**
 * Activates a vendor account (APPLYING/PENDING_DOCS → ACTIVE).
 */
export async function approveVendor(vendorId: string) {
  const session = await requireAdmin()

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) throw new Error('Productor no encontrado')
  if (!['APPLYING', 'PENDING_DOCS'].includes(vendor.status)) {
    throw new Error('El productor ya está activo o suspendido')
  }

  const before = getVendorAuditSnapshot(vendor)
  const ip = await getAuditRequestIp()

  await mutateWithAudit(async tx => {
    const updatedVendor = await tx.vendor.update({
      where: { id: vendorId },
      data: { status: 'ACTIVE' },
    })
    return {
      result: updatedVendor,
      audit: {
        action: 'VENDOR_APPROVED',
        entityType: 'Vendor',
        entityId: vendorId,
        before,
        after: getVendorAuditSnapshot(updatedVendor),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/productores')
  safeRevalidatePath('/admin/auditoria')
}

/**
 * Rejects a vendor application.
 */
export async function rejectVendor(vendorId: string) {
  const session = await requireAdmin()

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) throw new Error('Productor no encontrado')
  const before = getVendorAuditSnapshot(vendor)
  const ip = await getAuditRequestIp()

  await mutateWithAudit(async tx => {
    const updatedVendor = await tx.vendor.update({
      where: { id: vendorId },
      data: { status: 'REJECTED' },
    })
    return {
      result: updatedVendor,
      audit: {
        action: 'VENDOR_REJECTED',
        entityType: 'Vendor',
        entityId: vendorId,
        before,
        after: getVendorAuditSnapshot(updatedVendor),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/productores')
  safeRevalidatePath('/admin/auditoria')
}

/**
 * Suspends an active vendor (temporary).
 */
export async function suspendVendor(vendorId: string) {
  const session = await requireAdmin()

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) throw new Error('Productor no encontrado')
  const before = getVendorAuditSnapshot(vendor)
  const ip = await getAuditRequestIp()

  await mutateWithAudit(async tx => {
    const updatedVendor = await tx.vendor.update({
      where: { id: vendorId },
      data: { status: 'SUSPENDED_TEMP' },
    })
    return {
      result: updatedVendor,
      audit: {
        action: 'VENDOR_SUSPENDED',
        entityType: 'Vendor',
        entityId: vendorId,
        before,
        after: getVendorAuditSnapshot(updatedVendor),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/productores')
  safeRevalidatePath('/admin/auditoria')
}

// ─── Product moderation ───────────────────────────────────────────────────────

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  rejectionNote: z.string().max(500).optional(),
})

const marketplaceConfigSchema = z.object({
  DEFAULT_COMMISSION_RATE_PERCENT: z.coerce.number().min(0).max(100),
  FREE_SHIPPING_THRESHOLD: z.coerce.number().min(0).max(10000),
  FLAT_SHIPPING_COST: z.coerce.number().min(0).max(1000),
  MAINTENANCE_MODE: z.coerce.boolean().default(false),
  HERO_BANNER_TEXT: z.string().max(160).trim(),
})

const commissionRuleSchema = z.object({
  vendorId: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  type: z.enum(['PERCENTAGE', 'FIXED']),
  rate: z.coerce.number().min(0).max(1000),
})

const shippingZoneSchema = z.object({
  name: z.string().trim().min(2).max(80),
  provinces: z.string().trim().min(2),
})

const shippingRateSchema = z.object({
  zoneId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(80),
  minOrderAmount: z.coerce.number().min(0).optional(),
  price: z.coerce.number().min(0).max(1000),
  freeAbove: z.coerce.number().min(0).optional(),
})

export async function updateMarketplaceConfigAction(formData: FormData) {
  const session = await requireAdmin()
  if (!hasRole(session.user.role, [UserRole.SUPERADMIN, UserRole.ADMIN_OPS])) {
    throw new Error('No tienes permisos para actualizar la configuración del marketplace')
  }

  const previousConfig = await db.marketplaceConfig.findMany({
    where: {
      key: {
        in: [
          'DEFAULT_COMMISSION_RATE',
          'FREE_SHIPPING_THRESHOLD',
          'FLAT_SHIPPING_COST',
          'MAINTENANCE_MODE',
          'HERO_BANNER_TEXT',
          'commission_default',
        ],
      },
    },
    select: { key: true, value: true },
  })

  const parsed = marketplaceConfigSchema.parse({
    DEFAULT_COMMISSION_RATE_PERCENT: formData.get('DEFAULT_COMMISSION_RATE'),
    FREE_SHIPPING_THRESHOLD: formData.get('FREE_SHIPPING_THRESHOLD'),
    FLAT_SHIPPING_COST: formData.get('FLAT_SHIPPING_COST'),
    MAINTENANCE_MODE: formData.get('MAINTENANCE_MODE') === 'on',
    HERO_BANNER_TEXT: formData.get('HERO_BANNER_TEXT')?.toString() ?? '',
  })

  const updatedConfig = await setMarketplaceConfig({
    DEFAULT_COMMISSION_RATE: parsed.DEFAULT_COMMISSION_RATE_PERCENT / 100,
    FREE_SHIPPING_THRESHOLD: parsed.FREE_SHIPPING_THRESHOLD,
    FLAT_SHIPPING_COST: parsed.FLAT_SHIPPING_COST,
    MAINTENANCE_MODE: parsed.MAINTENANCE_MODE,
    HERO_BANNER_TEXT: parsed.HERO_BANNER_TEXT,
  })
  const ip = await getAuditRequestIp()

  const previousConfigSnapshot = Object.fromEntries(
    previousConfig.map(item => [item.key, item.value])
  ) as AuditValue

  // NOTE: `setMarketplaceConfig` is not a direct Prisma call (it upserts via
  // a helper), so we cannot wrap it with `mutateWithAudit`/`$transaction`
  // here. Fall back to the legacy direct audit call with `db` passed
  // explicitly; the audit write will still raise on failure (#381).
  await createAuditLog({
    action: 'MARKETPLACE_CONFIG_UPDATED',
    entityType: 'MarketplaceConfig',
    entityId: 'global',
    before: previousConfigSnapshot,
    after: updatedConfig,
    actorId: session.user.id,
    actorRole: session.user.role,
    ip,
  }, db)

  safeRevalidatePath('/admin/configuracion')
  safeRevalidatePath('/admin/dashboard')
  safeRevalidatePath('/admin/auditoria')
  safeRevalidatePath('/')
  safeRevalidatePath('/carrito')
  safeRevalidatePath('/checkout')
}

export async function createCommissionRule(formData: FormData) {
  const session = await requireAdmin()
  if (!hasRole(session.user.role, [UserRole.SUPERADMIN, UserRole.ADMIN_FINANCE, UserRole.ADMIN_OPS])) {
    throw new Error('No tienes permisos para gestionar reglas de comisión')
  }

  const parsed = commissionRuleSchema.parse({
    vendorId: formData.get('vendorId')?.toString() || undefined,
    categoryId: formData.get('categoryId')?.toString() || undefined,
    type: formData.get('type'),
    rate: formData.get('rate'),
  })

  if (!parsed.vendorId && !parsed.categoryId) {
    throw new Error('Debes seleccionar al menos un productor o una categoría')
  }

  const ip = await getAuditRequestIp()

  await mutateWithAudit(async tx => {
    const createdRule = await tx.commissionRule.create({
      data: {
        vendorId: parsed.vendorId ?? null,
        categoryId: parsed.categoryId ?? null,
        type: parsed.type,
        rate: parsed.rate,
        isActive: true,
      },
    })
    return {
      result: createdRule,
      audit: {
        action: 'COMMISSION_RULE_CREATED',
        entityType: 'CommissionRule',
        entityId: createdRule.id,
        after: {
          id: createdRule.id,
          vendorId: createdRule.vendorId,
          categoryId: createdRule.categoryId,
          type: createdRule.type,
          rate: Number(createdRule.rate),
          isActive: createdRule.isActive,
        },
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/comisiones')
  safeRevalidatePath('/admin/auditoria')
}

export async function toggleCommissionRule(ruleId: string) {
  const session = await requireAdmin()
  if (!hasRole(session.user.role, [UserRole.SUPERADMIN, UserRole.ADMIN_FINANCE, UserRole.ADMIN_OPS])) {
    throw new Error('No tienes permisos para gestionar reglas de comisión')
  }

  const rule = await db.commissionRule.findUnique({ where: { id: ruleId } })
  if (!rule) throw new Error('Regla no encontrada')

  const ip = await getAuditRequestIp()

  await mutateWithAudit(async tx => {
    const updatedRule = await tx.commissionRule.update({
      where: { id: ruleId },
      data: { isActive: !rule.isActive },
    })
    return {
      result: updatedRule,
      audit: {
        action: 'COMMISSION_RULE_TOGGLED',
        entityType: 'CommissionRule',
        entityId: ruleId,
        before: {
          id: rule.id,
          isActive: rule.isActive,
          type: rule.type,
          rate: Number(rule.rate),
        },
        after: {
          id: updatedRule.id,
          isActive: updatedRule.isActive,
          type: updatedRule.type,
          rate: Number(updatedRule.rate),
        },
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/comisiones')
  safeRevalidatePath('/admin/auditoria')
}

export async function deleteCommissionRule(ruleId: string) {
  const session = await requireAdmin()
  if (!hasRole(session.user.role, [UserRole.SUPERADMIN, UserRole.ADMIN_FINANCE, UserRole.ADMIN_OPS])) {
    throw new Error('No tienes permisos para gestionar reglas de comisión')
  }

  const rule = await db.commissionRule.findUnique({ where: { id: ruleId } })
  if (!rule) throw new Error('Regla no encontrada')

  const ip = await getAuditRequestIp()

  await mutateWithAudit(async tx => {
    const deletedRule = await tx.commissionRule.delete({ where: { id: ruleId } })
    return {
      result: deletedRule,
      audit: {
        action: 'COMMISSION_RULE_DELETED',
        entityType: 'CommissionRule',
        entityId: ruleId,
        before: {
          id: rule.id,
          vendorId: rule.vendorId,
          categoryId: rule.categoryId,
          type: rule.type,
          rate: Number(rule.rate),
          isActive: rule.isActive,
        },
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/comisiones')
  safeRevalidatePath('/admin/auditoria')
}

export async function createShippingZone(formData: FormData) {
  const session = await requireAdmin()
  if (!hasRole(session.user.role, [UserRole.SUPERADMIN, UserRole.ADMIN_OPS])) {
    throw new Error('No tienes permisos para gestionar zonas de envío')
  }

  const parsed = shippingZoneSchema.parse({
    name: formData.get('name'),
    provinces: formData.get('provinces'),
  })

  const ip = await getAuditRequestIp()

  await mutateWithAudit(async tx => {
    const createdZone = await tx.shippingZone.create({
      data: {
        name: parsed.name,
        provinces: parsed.provinces.split(',').map(value => value.trim()).filter(Boolean),
        isActive: true,
      },
    })
    return {
      result: createdZone,
      audit: {
        action: 'SHIPPING_ZONE_CREATED',
        entityType: 'ShippingZone',
        entityId: createdZone.id,
        after: {
          id: createdZone.id,
          name: createdZone.name,
          provinces: createdZone.provinces,
          isActive: createdZone.isActive,
        },
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/envios')
  safeRevalidatePath('/admin/auditoria')
}

export async function addShippingRate(formData: FormData) {
  const session = await requireAdmin()
  if (!hasRole(session.user.role, [UserRole.SUPERADMIN, UserRole.ADMIN_OPS])) {
    throw new Error('No tienes permisos para gestionar tarifas de envío')
  }

  const parsed = shippingRateSchema.parse({
    zoneId: formData.get('zoneId'),
    name: formData.get('name'),
    minOrderAmount: formData.get('minOrderAmount') || undefined,
    price: formData.get('price'),
    freeAbove: formData.get('freeAbove') || undefined,
  })

  const ip = await getAuditRequestIp()

  await mutateWithAudit(async tx => {
    const createdRate = await tx.shippingRate.create({
      data: {
        zoneId: parsed.zoneId,
        name: parsed.name,
        minOrderAmount: parsed.minOrderAmount ?? null,
        price: parsed.price,
        freeAbove: parsed.freeAbove ?? null,
        isActive: true,
      },
    })
    return {
      result: createdRate,
      audit: {
        action: 'SHIPPING_RATE_CREATED',
        entityType: 'ShippingRate',
        entityId: createdRate.id,
        after: {
          id: createdRate.id,
          zoneId: createdRate.zoneId,
          name: createdRate.name,
          minOrderAmount: createdRate.minOrderAmount == null ? null : Number(createdRate.minOrderAmount),
          price: Number(createdRate.price),
          freeAbove: createdRate.freeAbove == null ? null : Number(createdRate.freeAbove),
        },
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/envios')
  safeRevalidatePath('/admin/auditoria')
}

export async function deleteShippingRate(rateId: string) {
  const session = await requireAdmin()
  if (!hasRole(session.user.role, [UserRole.SUPERADMIN, UserRole.ADMIN_OPS])) {
    throw new Error('No tienes permisos para gestionar tarifas de envío')
  }

  const rate = await db.shippingRate.findUnique({ where: { id: rateId } })
  if (!rate) throw new Error('Tarifa no encontrada')

  const ip = await getAuditRequestIp()

  await mutateWithAudit(async tx => {
    const deletedRate = await tx.shippingRate.delete({ where: { id: rateId } })
    return {
      result: deletedRate,
      audit: {
        action: 'SHIPPING_RATE_DELETED',
        entityType: 'ShippingRate',
        entityId: rateId,
        before: {
          id: rate.id,
          zoneId: rate.zoneId,
          name: rate.name,
          minOrderAmount: rate.minOrderAmount == null ? null : Number(rate.minOrderAmount),
          price: Number(rate.price),
          freeAbove: rate.freeAbove == null ? null : Number(rate.freeAbove),
        },
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/envios')
  safeRevalidatePath('/admin/auditoria')
}

/**
 * Approves or rejects a product in PENDING_REVIEW status.
 * On approval, sets status to ACTIVE.
 * On rejection, sets status to REJECTED and records the note.
 */
export async function reviewProduct(
  productId: string,
  action: 'approve' | 'reject',
  rejectionNote?: string
) {
  const session = await requireAdmin()

  const { action: validAction, rejectionNote: note } = reviewSchema.parse({ action, rejectionNote })

  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) throw new Error('Producto no encontrado')
  if (product.status !== 'PENDING_REVIEW') {
    throw new Error('El producto no está en revisión')
  }

  // Stripe onboarding is only required to actually go live, so vendors can
  // submit drafts to review before finishing it. Block approval (not rejection)
  // until the payout destination is set up.
  if (validAction === 'approve') {
    const vendor = await db.vendor.findUnique({
      where: { id: product.vendorId },
      select: { stripeOnboarded: true },
    })
    if (!vendor) throw new Error('Productor no encontrado')
    assertVendorOnboarded(vendor)
  }

  const before = getProductAuditSnapshot(product)
  const ip = await getAuditRequestIp()

  const updatedProduct = await mutateWithAudit(async tx => {
    const updated = await tx.product.update({
      where: { id: productId },
      data:
        validAction === 'approve'
          ? { status: 'ACTIVE', rejectionNote: null }
          : { status: 'REJECTED', rejectionNote: note ?? 'No cumple los requisitos del catálogo' },
    })
    return {
      result: updated,
      audit: {
        action: validAction === 'approve' ? 'PRODUCT_APPROVED' : 'PRODUCT_REJECTED',
        entityType: 'Product',
        entityId: productId,
        before,
        after: getProductAuditSnapshot(updated),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/productos')
  safeRevalidatePath('/admin/auditoria')
  safeRevalidatePath('/vendor/productos')
  revalidateCatalogExperience({ productSlug: updatedProduct.slug })
}

/**
 * Suspends an active product.
 */
export async function suspendProduct(productId: string, reason: string) {
  const session = await requireAdmin()

  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) throw new Error('Producto no encontrado')
  const before = getProductAuditSnapshot(product)
  const ip = await getAuditRequestIp()

  const updatedProduct = await mutateWithAudit(async tx => {
    const updated = await tx.product.update({
      where: { id: productId },
      data: { status: 'SUSPENDED', rejectionNote: reason },
    })
    return {
      result: updated,
      audit: {
        action: 'PRODUCT_SUSPENDED',
        entityType: 'Product',
        entityId: productId,
        before,
        after: getProductAuditSnapshot(updated),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/productos')
  safeRevalidatePath('/admin/auditoria')
  safeRevalidatePath('/vendor/productos')
  revalidateCatalogExperience({ productSlug: updatedProduct.slug })
}

export async function approveSettlement(settlementId: string) {
  // Settlement approval moves real money to vendors. Restrict to
  // FINANCE_ADMIN + SUPERADMIN; ADMIN_OPS retains visibility but
  // cannot approve. (#403)
  const session = await requireFinanceAdmin()

  const settlement = await db.settlement.findUnique({ where: { id: settlementId } })
  if (!settlement) throw new Error('Liquidación no encontrada')
  if (!['DRAFT', 'PENDING_APPROVAL'].includes(settlement.status)) {
    throw new Error('La liquidación no está pendiente de aprobación')
  }

  const before = getSettlementAuditSnapshot(settlement)
  const ip = await getAuditRequestIp()

  await mutateWithAudit(async tx => {
    const updatedSettlement = await tx.settlement.update({
      where: { id: settlementId },
      data: { status: 'APPROVED' },
    })
    return {
      result: updatedSettlement,
      audit: {
        action: 'SETTLEMENT_APPROVED',
        entityType: 'Settlement',
        entityId: settlementId,
        before,
        after: getSettlementAuditSnapshot(updatedSettlement),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/liquidaciones')
  safeRevalidatePath('/admin/auditoria')
}

export async function markSettlementPaid(settlementId: string) {
  // Marking a settlement PAID is the final financial step before payout.
  // Restrict to FINANCE_ADMIN + SUPERADMIN. (#403)
  const session = await requireFinanceAdmin()

  const settlement = await db.settlement.findUnique({ where: { id: settlementId } })
  if (!settlement) throw new Error('Liquidación no encontrada')
  if (settlement.status !== 'APPROVED') {
    throw new Error('Solo se pueden marcar como pagadas las liquidaciones aprobadas')
  }

  const before = getSettlementAuditSnapshot(settlement)
  const ip = await getAuditRequestIp()

  await mutateWithAudit(async tx => {
    const updatedSettlement = await tx.settlement.update({
      where: { id: settlementId },
      data: { status: 'PAID', paidAt: new Date() },
    })
    return {
      result: updatedSettlement,
      audit: {
        action: 'SETTLEMENT_PAID',
        entityType: 'Settlement',
        entityId: settlementId,
        before,
        after: getSettlementAuditSnapshot(updatedSettlement),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/liquidaciones')
  safeRevalidatePath('/admin/auditoria')
}

// ─── Order management ─────────────────────────────────────────────────────────

const CANCELLABLE_ORDER_STATUSES = ['PLACED', 'PAYMENT_CONFIRMED', 'PROCESSING', 'PARTIALLY_SHIPPED'] as const

/**
 * Cancels an order. Only admin can cancel.
 * - Cascades cancellation to all non-terminal VendorFulfillments
 * - Restores stock for all tracked products in the order
 * - Orders with SHIPPED or DELIVERED fulfillments cannot be cancelled (those
 *   lines require manual intervention / refund flow).
 */
export async function cancelOrder(orderId: string, reason: string) {
  // Order cancellation rolls back stock + may trigger refunds via the
  // payments domain. Restrict to OPS + SUPERADMIN. (#403)
  const session = await requireOpsAdmin()

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      lines: {
        include: { product: { select: { trackStock: true } } },
      },
      fulfillments: { select: { vendorId: true, status: true } },
    },
  })

  if (!order) throw new Error('Pedido no encontrado')
  if (!(CANCELLABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
    throw new Error(`No se puede cancelar un pedido en estado ${order.status}`)
  }

  // Stock from already-shipped fulfillments was physically dispatched — do not restore it
  const shippedVendorIds = new Set(
    order.fulfillments
      .filter(f => f.status === 'SHIPPED' || f.status === 'DELIVERED')
      .map(f => f.vendorId)
  )

  await db.$transaction(async tx => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    })

    // Cascade cancellation to all non-terminal fulfillments
    await tx.vendorFulfillment.updateMany({
      where: {
        orderId,
        status: { notIn: ['SHIPPED', 'DELIVERED', 'CANCELLED'] },
      },
      data: { status: 'CANCELLED' },
    })

    // Restore stock only for lines whose vendor has not yet shipped
    for (const line of order.lines) {
      if (!line.product.trackStock) continue
      if (shippedVendorIds.has(line.vendorId)) continue

      if (line.variantId) {
        await tx.productVariant.update({
          where: { id: line.variantId },
          data: { stock: { increment: line.quantity } },
        })
        continue
      }

      await tx.product.update({
        where: { id: line.productId },
        data: { stock: { increment: line.quantity } },
      })
    }

    await tx.orderEvent.create({
      data: {
        orderId,
        actorId: session.user.id,
        type: 'ORDER_CANCELLED',
        payload: { reason, cancelledBy: session.user.id },
      },
    })
  })

  safeRevalidatePath('/admin/pedidos')
  safeRevalidatePath(`/admin/pedidos/${orderId}`)
}
