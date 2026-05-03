'use server'

/**
 * Settlement calculation and generation logic
 * Computes vendor payouts based on delivered orders, commissions, and refunds
 */

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
// eslint-disable-next-line no-restricted-imports -- finance/commission stays out of the barrel (dynamic db import)
import { resolveEffectiveCommissionRate } from '@/domains/finance/commission'

export interface SettlementData {
  vendorId: string
  periodFrom: Date
  periodTo: Date
  grossSales: number
  commissions: number
  refunds: number
  adjustments: number
  netPayable: number
}

/**
 * Calculate a settlement for a vendor in a given period
 * Includes: delivered orders, commissions, refunds
 */
export async function calculateSettlement(
  vendorId: string,
  periodFrom: Date,
  periodTo: Date
): Promise<SettlementData> {
  // 1. Get all delivered order lines for vendor in period
  const lines = await db.orderLine.findMany({
    where: {
      vendorId,
      order: {
        status: { in: ['DELIVERED', 'SHIPPED'] }, // Include recent shipments
        updatedAt: {
          gte: periodFrom,
          lte: periodTo,
        },
      },
    },
  })

  const grossSales = lines.reduce((sum, line) => {
    const amount = Number(line.unitPrice) * line.quantity
    return sum + amount
  }, 0)

  // 2. Get commission rate and calculate
  const commissionRate = await resolveEffectiveCommissionRate(vendorId)
  const commissions = grossSales * commissionRate

  // 3. Get refunds for this vendor's orders in period
  const refundResult = await db.refund.aggregate({
    where: {
      payment: {
        order: {
          lines: { some: { vendorId } },
          status: { in: ['DELIVERED', 'SHIPPED'] },
        },
      },
      createdAt: { gte: periodFrom, lte: periodTo },
    },
    _sum: { amount: true },
  })

  const refunds = refundResult._sum.amount ? Number(refundResult._sum.amount) : 0

  // 4. Calculate net payable
  const netPayable = grossSales - commissions - refunds

  return {
    vendorId,
    periodFrom,
    periodTo,
    grossSales,
    commissions,
    refunds,
    adjustments: 0,
    netPayable,
  }
}

/**
 * Create or update a settlement record
 */
export async function upsertSettlement(data: SettlementData) {
  // Check if settlement already exists for this period/vendor
  const existing = await db.settlement.findFirst({
    where: {
      vendorId: data.vendorId,
      periodFrom: data.periodFrom,
      periodTo: data.periodTo,
    },
  })

  if (existing) {
    return db.settlement.update({
      where: { id: existing.id },
      data: {
        grossSales: data.grossSales,
        commissions: data.commissions,
        refunds: data.refunds,
        adjustments: data.adjustments,
        netPayable: data.netPayable,
      },
    })
  }

  return db.settlement.create({
    data: {
      ...data,
      status: 'DRAFT',
      paidAt: null,
    },
  })
}

/**
 * Generate settlements for all vendors for a given period
 * Typically called weekly/monthly
 */
export async function generateSettlementsForPeriod(periodFrom: Date, periodTo: Date) {
  const vendors = await db.vendor.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })

  const results = []
  for (const vendor of vendors) {
    try {
      const calculation = await calculateSettlement(vendor.id, periodFrom, periodTo)

      // Only create if there are sales
      if (calculation.grossSales > 0) {
        const settlement = await upsertSettlement(calculation)
        results.push({ vendorId: vendor.id, success: true, settlementId: settlement.id })
      }
    } catch (error) {
      logger.error('settlements.generate.failed', { vendorId: vendor.id, error })
      results.push({ vendorId: vendor.id, success: false, error: String(error) })
    }
  }

  return results
}
