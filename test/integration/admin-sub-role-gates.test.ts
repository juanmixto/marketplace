import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  approveSettlement,
  markSettlementPaid,
  cancelOrder,
  approveVendor,
  reviewProduct,
} from '@/domains/admin/actions'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createUser,
  createVendorUser,
  createActiveProduct,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'
import type { UserRole } from '@/generated/prisma/enums'

/**
 * Issue #403: admin sub-role gates.
 *
 * The audit found that several financial / operational admin actions
 * were gated only by `requireAdmin()` (any admin role). This suite:
 *
 * 1. Pins the new tighter gates introduced in this PR
 *    (FINANCE_ADMIN for settlements, OPS_ADMIN for cancelOrder).
 * 2. Documents the current looser gates left in place
 *    (vendor / product moderation still allow any admin role) so a
 *    future tightening is visible as a test diff, not a behaviour
 *    surprise.
 */

const ALL_ADMIN_SUB_ROLES: UserRole[] = [
  'ADMIN_SUPPORT',
  'ADMIN_CATALOG',
  'ADMIN_FINANCE',
  'ADMIN_OPS',
  'SUPERADMIN',
]

// FINANCE_ADMIN_ROLES (src/lib/roles.ts) intentionally bundles
// ADMIN_OPS with ADMIN_FINANCE + SUPERADMIN — ops on-call needs
// finance access for incident handling. OPS_ADMIN_ROLES is the
// strict ops-only subset.
const FINANCE_ALLOWED: UserRole[] = ['ADMIN_FINANCE', 'ADMIN_OPS', 'SUPERADMIN']
const OPS_ALLOWED: UserRole[] = ['ADMIN_OPS', 'SUPERADMIN']
const CATALOG_ALLOWED: UserRole[] = ['ADMIN_CATALOG', 'SUPERADMIN']
const FINANCE_DENIED = ALL_ADMIN_SUB_ROLES.filter(r => !FINANCE_ALLOWED.includes(r))
const OPS_DENIED = ALL_ADMIN_SUB_ROLES.filter(r => !OPS_ALLOWED.includes(r))
const CATALOG_DENIED = ALL_ADMIN_SUB_ROLES.filter(r => !CATALOG_ALLOWED.includes(r))

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

async function createDraftSettlement() {
  const { vendor } = await createVendorUser()
  return db.settlement.create({
    data: {
      vendorId: vendor.id,
      periodFrom: new Date('2026-04-01'),
      periodTo: new Date('2026-04-30'),
      grossSales: 1000,
      commissions: 100,
      refunds: 0,
      adjustments: 0,
      netPayable: 900,
      status: 'DRAFT',
    },
  })
}

async function createApprovedSettlement() {
  const { vendor } = await createVendorUser()
  return db.settlement.create({
    data: {
      vendorId: vendor.id,
      periodFrom: new Date('2026-04-01'),
      periodTo: new Date('2026-04-30'),
      grossSales: 500,
      commissions: 50,
      refunds: 0,
      adjustments: 0,
      netPayable: 450,
      status: 'APPROVED',
    },
  })
}

async function createCancellableOrder() {
  const buyer = await createUser('CUSTOMER')
  return db.order.create({
    data: {
      orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
      customerId: buyer.id,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      subtotal: 25,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 25,
    },
  })
}

async function asAdminRole(role: UserRole) {
  const u = await db.user.create({
    data: {
      email: `${role.toLowerCase()}-${randomUUID().slice(0, 6)}@example.com`,
      firstName: role,
      lastName: 'Tester',
      role,
      isActive: true,
    },
  })
  useTestSession(buildSession(u.id, role))
  return u
}

// ─── approveSettlement: FINANCE-only ────────────────────────────────────────

for (const role of FINANCE_ALLOWED) {
  test(`approveSettlement: ${role} can approve`, async () => {
    const settlement = await createDraftSettlement()
    await asAdminRole(role)
    await approveSettlement(settlement.id)
    const updated = await db.settlement.findUniqueOrThrow({ where: { id: settlement.id } })
    assert.equal(updated.status, 'APPROVED')
  })
}

for (const role of FINANCE_DENIED) {
  test(`approveSettlement: ${role} is REJECTED`, async () => {
    const settlement = await createDraftSettlement()
    await asAdminRole(role)
    await assert.rejects(() => approveSettlement(settlement.id), /NEXT_REDIRECT|redirect/i)
    const stillDraft = await db.settlement.findUniqueOrThrow({ where: { id: settlement.id } })
    assert.equal(stillDraft.status, 'DRAFT')
  })
}

// ─── markSettlementPaid: FINANCE-only ──────────────────────────────────────

for (const role of FINANCE_DENIED) {
  test(`markSettlementPaid: ${role} is REJECTED`, async () => {
    const settlement = await createApprovedSettlement()
    await asAdminRole(role)
    await assert.rejects(() => markSettlementPaid(settlement.id), /NEXT_REDIRECT|redirect/i)
    const stillApproved = await db.settlement.findUniqueOrThrow({ where: { id: settlement.id } })
    assert.equal(stillApproved.status, 'APPROVED')
  })
}

test('markSettlementPaid: ADMIN_FINANCE can mark paid', async () => {
  const settlement = await createApprovedSettlement()
  await asAdminRole('ADMIN_FINANCE')
  await markSettlementPaid(settlement.id)
  const paid = await db.settlement.findUniqueOrThrow({ where: { id: settlement.id } })
  assert.equal(paid.status, 'PAID')
  assert.ok(paid.paidAt)
})

// ─── cancelOrder: OPS-only ─────────────────────────────────────────────────

for (const role of OPS_DENIED) {
  test(`cancelOrder: ${role} is REJECTED`, async () => {
    const order = await createCancellableOrder()
    await asAdminRole(role)
    await assert.rejects(() => cancelOrder(order.id, 'test'), /NEXT_REDIRECT|redirect/i)
    const stillPlaced = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    assert.equal(stillPlaced.status, 'PLACED')
  })
}

test('cancelOrder: ADMIN_OPS can cancel', async () => {
  const order = await createCancellableOrder()
  await asAdminRole('ADMIN_OPS')
  await cancelOrder(order.id, 'ops test')
  const cancelled = await db.order.findUniqueOrThrow({ where: { id: order.id } })
  assert.equal(cancelled.status, 'CANCELLED')
})

// ─── approveVendor: OPS-only (#1145) ────────────────────────────────────────

async function createApplyingVendor(opts: { stripeReady: boolean }) {
  const vendorUser = await createUser('VENDOR')
  return db.vendor.create({
    data: {
      userId: vendorUser.id,
      slug: `applying-${randomUUID().slice(0, 8)}`,
      displayName: 'Applying',
      status: 'APPLYING',
      stripeAccountId: opts.stripeReady ? `acct_test_${randomUUID().replace(/-/g, '')}` : null,
      stripeOnboarded: opts.stripeReady,
    },
  })
}

for (const role of OPS_DENIED) {
  test(`approveVendor: ${role} is REJECTED`, async () => {
    const vendor = await createApplyingVendor({ stripeReady: true })
    await asAdminRole(role)
    await assert.rejects(() => approveVendor(vendor.id), /NEXT_REDIRECT|redirect/i)
    const stillApplying = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })
    assert.equal(stillApplying.status, 'APPLYING')
  })
}

for (const role of OPS_ALLOWED) {
  test(`approveVendor: ${role} can approve`, async () => {
    const vendor = await createApplyingVendor({ stripeReady: true })
    await asAdminRole(role)
    await approveVendor(vendor.id)
    const active = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })
    assert.equal(active.status, 'ACTIVE')
  })
}

// #1333: vendor cannot become ACTIVE without Stripe Connect ready.
test('approveVendor: rejects when stripeAccountId is null', async () => {
  const vendorUser = await createUser('VENDOR')
  const vendor = await db.vendor.create({
    data: {
      userId: vendorUser.id,
      slug: `applying-${randomUUID().slice(0, 8)}`,
      displayName: 'No Stripe Account',
      status: 'APPLYING',
      stripeAccountId: null,
      stripeOnboarded: true, // even if flag set, no acct id is invalid
    },
  })
  await asAdminRole('SUPERADMIN')
  await assert.rejects(() => approveVendor(vendor.id), /Stripe Connect/i)
  const stillApplying = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })
  assert.equal(stillApplying.status, 'APPLYING')
})

test('approveVendor: rejects when stripeOnboarded is false', async () => {
  const vendor = await createApplyingVendor({ stripeReady: false })
  // Force an account id but keep onboarded=false (simulates account
  // created but onboarding incomplete).
  await db.vendor.update({
    where: { id: vendor.id },
    data: { stripeAccountId: `acct_test_${randomUUID().replace(/-/g, '')}` },
  })
  await asAdminRole('SUPERADMIN')
  await assert.rejects(() => approveVendor(vendor.id), /Stripe Connect/i)
  const stillApplying = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })
  assert.equal(stillApplying.status, 'APPLYING')
})

// #1332: settlement cannot be marked PAID without Stripe Connect ready.
test('markSettlementPaid: rejects when vendor has no stripeAccountId', async () => {
  const vendorUser = await createUser('VENDOR')
  const vendor = await db.vendor.create({
    data: {
      userId: vendorUser.id,
      slug: `vendor-${randomUUID().slice(0, 8)}`,
      displayName: 'No Stripe',
      status: 'ACTIVE',
      stripeAccountId: null,
      stripeOnboarded: false,
    },
  })
  const settlement = await db.settlement.create({
    data: {
      vendorId: vendor.id,
      periodFrom: new Date('2026-04-01'),
      periodTo: new Date('2026-04-30'),
      grossSales: 500,
      commissions: 50,
      refunds: 0,
      adjustments: 0,
      netPayable: 450,
      status: 'APPROVED',
    },
  })
  await asAdminRole('ADMIN_FINANCE')
  await assert.rejects(() => markSettlementPaid(settlement.id), /Stripe Connect/i)
  const stillApproved = await db.settlement.findUniqueOrThrow({ where: { id: settlement.id } })
  assert.equal(stillApproved.status, 'APPROVED')
})

// ─── reviewProduct: CATALOG-only (#1145) ───────────────────────────────────

for (const role of CATALOG_DENIED) {
  test(`reviewProduct(reject): ${role} is REJECTED`, async () => {
    const { vendor } = await createVendorUser()
    const product = await createActiveProduct(vendor.id, { status: 'PENDING_REVIEW' })
    await asAdminRole(role)
    await assert.rejects(
      () => reviewProduct(product.id, 'reject', 'test reject'),
      /NEXT_REDIRECT|redirect/i,
    )
    const stillPending = await db.product.findUniqueOrThrow({ where: { id: product.id } })
    assert.equal(stillPending.status, 'PENDING_REVIEW')
  })
}

test('reviewProduct(reject): ADMIN_CATALOG can reject', async () => {
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { status: 'PENDING_REVIEW' })
  await asAdminRole('ADMIN_CATALOG')
  await reviewProduct(product.id, 'reject', 'test reject')
  const rejected = await db.product.findUniqueOrThrow({ where: { id: product.id } })
  assert.equal(rejected.status, 'REJECTED')
})
