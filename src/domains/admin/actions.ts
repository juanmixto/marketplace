'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { setMarketplaceConfig } from '@/lib/config'
import { createAuditLog, getAuditRequestIp, type AuditValue } from '@/lib/audit'

const ADMIN_ROLES = ['ADMIN_SUPPORT', 'ADMIN_CATALOG', 'ADMIN_FINANCE', 'ADMIN_OPS', 'SUPERADMIN'] as const

async function requireAdmin() {
  const session = await auth()
  if (!session || !ADMIN_ROLES.includes(session.user.role as typeof ADMIN_ROLES[number])) {
    redirect('/login')
  }
  return session
}

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
  const updatedVendor = await db.vendor.update({
    where: { id: vendorId },
    data: { status: 'ACTIVE' },
  })
  const ip = await getAuditRequestIp()

  await createAuditLog({
    action: 'VENDOR_APPROVED',
    entityType: 'Vendor',
    entityId: vendorId,
    before,
    after: getVendorAuditSnapshot(updatedVendor),
    actorId: session.user.id,
    actorRole: session.user.role,
    ip,
  })

  revalidatePath('/admin/productores')
  revalidatePath('/admin/auditoria')
}

/**
 * Rejects a vendor application.
 */
export async function rejectVendor(vendorId: string) {
  const session = await requireAdmin()

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) throw new Error('Productor no encontrado')
  const before = getVendorAuditSnapshot(vendor)

  const updatedVendor = await db.vendor.update({
    where: { id: vendorId },
    data: { status: 'REJECTED' },
  })
  const ip = await getAuditRequestIp()

  await createAuditLog({
    action: 'VENDOR_REJECTED',
    entityType: 'Vendor',
    entityId: vendorId,
    before,
    after: getVendorAuditSnapshot(updatedVendor),
    actorId: session.user.id,
    actorRole: session.user.role,
    ip,
  })

  revalidatePath('/admin/productores')
  revalidatePath('/admin/auditoria')
}

/**
 * Suspends an active vendor (temporary).
 */
export async function suspendVendor(vendorId: string) {
  const session = await requireAdmin()

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) throw new Error('Productor no encontrado')
  const before = getVendorAuditSnapshot(vendor)

  const updatedVendor = await db.vendor.update({
    where: { id: vendorId },
    data: { status: 'SUSPENDED_TEMP' },
  })
  const ip = await getAuditRequestIp()

  await createAuditLog({
    action: 'VENDOR_SUSPENDED',
    entityType: 'Vendor',
    entityId: vendorId,
    before,
    after: getVendorAuditSnapshot(updatedVendor),
    actorId: session.user.id,
    actorRole: session.user.role,
    ip,
  })

  revalidatePath('/admin/productores')
  revalidatePath('/admin/auditoria')
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

export async function updateMarketplaceConfigAction(formData: FormData) {
  const session = await requireAdmin()
  if (session.user.role !== 'SUPERADMIN' && session.user.role !== 'ADMIN_OPS') {
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

  await createAuditLog({
    action: 'MARKETPLACE_CONFIG_UPDATED',
    entityType: 'MarketplaceConfig',
    entityId: 'global',
    before: previousConfigSnapshot,
    after: updatedConfig,
    actorId: session.user.id,
    actorRole: session.user.role,
    ip,
  })

  revalidatePath('/admin/configuracion')
  revalidatePath('/admin/dashboard')
  revalidatePath('/admin/auditoria')
  revalidatePath('/')
  revalidatePath('/carrito')
  revalidatePath('/checkout')
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

  const before = getProductAuditSnapshot(product)
  const updatedProduct = await db.product.update({
    where: { id: productId },
    data:
      validAction === 'approve'
        ? { status: 'ACTIVE', rejectionNote: null }
        : { status: 'REJECTED', rejectionNote: note ?? 'No cumple los requisitos del catálogo' },
  })
  const ip = await getAuditRequestIp()

  await createAuditLog({
    action: validAction === 'approve' ? 'PRODUCT_APPROVED' : 'PRODUCT_REJECTED',
    entityType: 'Product',
    entityId: productId,
    before,
    after: getProductAuditSnapshot(updatedProduct),
    actorId: session.user.id,
    actorRole: session.user.role,
    ip,
  })

  revalidatePath('/admin/productos')
  revalidatePath('/admin/auditoria')
  revalidatePath('/vendor/productos')
}

/**
 * Suspends an active product.
 */
export async function suspendProduct(productId: string, reason: string) {
  const session = await requireAdmin()

  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) throw new Error('Producto no encontrado')
  const before = getProductAuditSnapshot(product)

  const updatedProduct = await db.product.update({
    where: { id: productId },
    data: { status: 'SUSPENDED', rejectionNote: reason },
  })
  const ip = await getAuditRequestIp()

  await createAuditLog({
    action: 'PRODUCT_SUSPENDED',
    entityType: 'Product',
    entityId: productId,
    before,
    after: getProductAuditSnapshot(updatedProduct),
    actorId: session.user.id,
    actorRole: session.user.role,
    ip,
  })

  revalidatePath('/admin/productos')
  revalidatePath('/admin/auditoria')
  revalidatePath('/vendor/productos')
}

export async function approveSettlement(settlementId: string) {
  const session = await requireAdmin()

  const settlement = await db.settlement.findUnique({ where: { id: settlementId } })
  if (!settlement) throw new Error('Liquidación no encontrada')
  if (!['DRAFT', 'PENDING_APPROVAL'].includes(settlement.status)) {
    throw new Error('La liquidación no está pendiente de aprobación')
  }

  const before = getSettlementAuditSnapshot(settlement)
  const updatedSettlement = await db.settlement.update({
    where: { id: settlementId },
    data: { status: 'APPROVED' },
  })
  const ip = await getAuditRequestIp()

  await createAuditLog({
    action: 'SETTLEMENT_APPROVED',
    entityType: 'Settlement',
    entityId: settlementId,
    before,
    after: getSettlementAuditSnapshot(updatedSettlement),
    actorId: session.user.id,
    actorRole: session.user.role,
    ip,
  })

  revalidatePath('/admin/liquidaciones')
  revalidatePath('/admin/auditoria')
}

export async function markSettlementPaid(settlementId: string) {
  const session = await requireAdmin()

  const settlement = await db.settlement.findUnique({ where: { id: settlementId } })
  if (!settlement) throw new Error('Liquidación no encontrada')
  if (settlement.status !== 'APPROVED') {
    throw new Error('Solo se pueden marcar como pagadas las liquidaciones aprobadas')
  }

  const before = getSettlementAuditSnapshot(settlement)
  const updatedSettlement = await db.settlement.update({
    where: { id: settlementId },
    data: { status: 'PAID', paidAt: new Date() },
  })
  const ip = await getAuditRequestIp()

  await createAuditLog({
    action: 'SETTLEMENT_PAID',
    entityType: 'Settlement',
    entityId: settlementId,
    before,
    after: getSettlementAuditSnapshot(updatedSettlement),
    actorId: session.user.id,
    actorRole: session.user.role,
    ip,
  })

  revalidatePath('/admin/liquidaciones')
  revalidatePath('/admin/auditoria')
}
