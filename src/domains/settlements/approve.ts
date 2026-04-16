'use server'

/**
 * Admin settlement approval and payment flow
 */

import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'

/**
 * Approve a settlement for payment
 * Only admins can do this
 */
export async function approveSettlement(settlementId: string, _comment?: string) {
  const session = await getActionSession()
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    throw new Error('No autorizado')
  }

  const settlement = await db.settlement.findUnique({ where: { id: settlementId } })
  if (!settlement) {
    throw new Error('Liquidación no encontrada')
  }

  if (settlement.status !== 'DRAFT') {
    throw new Error(`No se puede aprobar una liquidación en estado ${settlement.status}`)
  }

  return db.settlement.update({
    where: { id: settlementId },
    data: {
      status: 'PENDING_APPROVAL',
      // Could add admin comment in metadata if needed
    },
  })
}

/**
 * Reject a settlement (send back to DRAFT for adjustments)
 */
export async function rejectSettlement(settlementId: string, _reason: string) {
  const session = await getActionSession()
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    throw new Error('No autorizado')
  }

  const settlement = await db.settlement.findUnique({ where: { id: settlementId } })
  if (!settlement) {
    throw new Error('Liquidación no encontrada')
  }

  return db.settlement.update({
    where: { id: settlementId },
    data: {
      status: 'DRAFT',
    },
  })
}

/**
 * Mark settlement as paid (after bank transfer)
 */
export async function markAsPayd(settlementId: string) {
  const session = await getActionSession()
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    throw new Error('No autorizado')
  }

  const settlement = await db.settlement.findUnique({ where: { id: settlementId } })
  if (!settlement) {
    throw new Error('Liquidación no encontrada')
  }

  if (settlement.status !== 'APPROVED') {
    throw new Error('Solo se pueden marcar como pagadas las liquidaciones aprobadas')
  }

  return db.settlement.update({
    where: { id: settlementId },
    data: {
      status: 'PAID',
      paidAt: new Date(),
    },
  })
}

/**
 * Add adjustment to a settlement (before approval)
 */
export async function adjustSettlement(
  settlementId: string,
  adjustmentAmount: number,
  _reason: string
) {
  const session = await getActionSession()
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    throw new Error('No autorizado')
  }

  const settlement = await db.settlement.findUnique({ where: { id: settlementId } })
  if (!settlement) {
    throw new Error('Liquidación no encontrada')
  }

  if (settlement.status !== 'DRAFT') {
    throw new Error('Solo se pueden ajustar liquidaciones en estado DRAFT')
  }

  const newAdjustments = Number(settlement.adjustments) + adjustmentAmount
  const newNetPayable =
    Number(settlement.grossSales) -
    Number(settlement.commissions) -
    Number(settlement.refunds) +
    newAdjustments

  return db.settlement.update({
    where: { id: settlementId },
    data: {
      adjustments: newAdjustments,
      netPayable: newNetPayable,
    },
  })
}

/**
 * Get settlements pending review
 */
export async function getPendingSettlements() {
  const session = await getActionSession()
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    throw new Error('No autorizado')
  }

  return db.settlement.findMany({
    where: { status: 'DRAFT' },
    include: {
      vendor: { select: { displayName: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}
