import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { getServerEnv } from '../src/lib/env'

const adapter = new PrismaPg({ connectionString: getServerEnv().databaseUrl })
const db = new PrismaClient({ adapter })

const demoEmails = [
  'productor@test.com',
  'cliente@test.com',
  'marta@demo.com',
  'javier@demo.com',
  'huerta@demo.com',
  'queseria@demo.com',
  'bodega@demo.com',
  'obrador@demo.com',
  'almazara@demo.com',
  'granja@demo.com',
  'secano@demo.com',
]

async function main() {
  console.log('🧹 Clearing demo data...')

  const demoUsers = await db.user.findMany({
    where: { email: { in: demoEmails } },
    select: { id: true },
  })
  const demoUserIds = demoUsers.map(user => user.id)

  const demoVendors = await db.vendor.findMany({
    where: {
      OR: [
        { slug: { contains: 'demo' } },
        { user: { email: { in: demoEmails } } },
        { slug: { in: [
          'finca-garcia',
          'huerta-la-solana',
          'queseria-monteazul',
          'bodega-ribera-viva',
          'obrador-santa-ines',
          'almazara-nueva-era',
          'granja-los-almendros',
          'secano-del-sur',
        ] } },
      ],
    },
    select: { id: true },
  })
  const demoVendorIds = demoVendors.map(vendor => vendor.id)

  const demoOrders = await db.order.findMany({
    where: {
      OR: [
        { id: { startsWith: 'order-demo-' } },
        { orderNumber: { startsWith: 'DEMO-' } },
      ],
    },
    select: { id: true },
  })
  const demoOrderIds = demoOrders.map(order => order.id)

  const demoPayments = await db.payment.findMany({
    where: {
      OR: [
        { providerRef: { startsWith: 'mock_pi_order-demo-' } },
        { orderId: { in: demoOrderIds } },
      ],
    },
    select: { id: true },
  })
  const demoPaymentIds = demoPayments.map(payment => payment.id)

  const demoProducts = await db.product.findMany({
    where: {
      OR: [
        { id: { startsWith: 'prod-' } },
        { vendorId: { in: demoVendorIds } },
      ],
    },
    select: { id: true },
  })
  const demoProductIds = demoProducts.map(product => product.id)

  await db.incidentMessage.deleteMany({
    where: {
      OR: [
        { id: { startsWith: 'incident-msg-' } },
        { incidentId: { startsWith: 'incident-demo-' } },
      ],
    },
  })
  await db.incident.deleteMany({
    where: {
      OR: [
        { id: { startsWith: 'incident-demo-' } },
        { orderId: { in: demoOrderIds } },
      ],
    },
  })
  await db.auditLog.deleteMany({
    where: { id: { startsWith: 'audit-demo-' } },
  })
  await db.review.deleteMany({
    where: {
      OR: [
        { id: { startsWith: 'review-demo-' } },
        { orderId: { in: demoOrderIds } },
      ],
    },
  })
  await db.refund.deleteMany({
    where: {
      OR: [
        { id: { startsWith: 'refund-demo-' } },
        { paymentId: { in: demoPaymentIds } },
      ],
    },
  })
  await db.payment.deleteMany({
    where: {
      OR: [
        { providerRef: { startsWith: 'mock_pi_order-demo-' } },
        { orderId: { in: demoOrderIds } },
      ],
    },
  })
  await db.vendorFulfillment.deleteMany({
    where: {
      OR: [
        { id: { startsWith: 'fulfillment-order-demo-' } },
        { orderId: { in: demoOrderIds } },
      ],
    },
  })
  await db.orderEvent.deleteMany({
    where: { orderId: { in: demoOrderIds } },
  })
  await db.orderLine.deleteMany({
    where: {
      OR: [
        { id: { startsWith: 'line-demo-' } },
        { orderId: { in: demoOrderIds } },
      ],
    },
  })
  await db.order.deleteMany({
    where: { id: { in: demoOrderIds } },
  })
  await db.settlement.deleteMany({
    where: { id: { startsWith: 'settlement-demo-' } },
  })
  await db.commissionRule.deleteMany({
    where: {
      id: {
        in: [
          'rule-vendor-finca',
          'rule-vendor-obrador',
          'rule-cat-panaderia',
          'rule-cat-vinos',
        ],
      },
    },
  })
  await db.productVariant.deleteMany({
    where: {
      OR: [
        { sku: { startsWith: 'TOM-' } },
        { sku: { startsWith: 'QCC-' } },
        { productId: { in: demoProductIds } },
      ],
    },
  })
  await db.product.deleteMany({
    where: { id: { in: demoProductIds } },
  })
  await db.shippingRate.deleteMany({
    where: { id: { in: ['rate-peninsula-premium', 'rate-baleares-std', 'rate-peninsula-std'] } },
  })
  await db.shippingZone.deleteMany({
    where: { id: { in: ['zone-baleares', 'zone-peninsula'] } },
  })
  await db.address.deleteMany({
    where: { id: 'addr-cliente-main' },
  })
  await db.vendor.deleteMany({
    where: { id: { in: demoVendorIds } },
  })
  await db.user.deleteMany({
    where: { id: { in: demoUserIds } },
  })

  console.log('✅ Demo data cleared')
}

main()
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
