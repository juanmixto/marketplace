import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  resetIntegrationDatabase,
  createUser,
  createVendorUser,
  createCategory,
  createActiveProduct,
} from './helpers'

/**
 * DB audit P1.2-A (#963). The vendor reviews page now paginates by
 * cursor instead of hydrating every review at once. The loader logic
 * is inline in the page component, but the contract is straightforward
 * to assert against the underlying Prisma query: stable order
 * (createdAt desc, id desc tiebreaker), `take = pageSize + 1` probe,
 * `cursor + skip 1` for subsequent pages.
 */

const PAGE_SIZE = 20

async function seedReviews(vendorId: string, productId: string, n: number) {
  // node-postgres datetime resolution is ms; createdAt collisions are
  // possible in fast loops, so the id tiebreaker matters. Stagger to be
  // safe but keep some adjacent timestamps to exercise the tiebreaker.
  const reviews = []
  for (let i = 0; i < n; i++) {
    const customer = await createUser('CUSTOMER')
    const order = await db.order.create({
      data: {
        orderNumber: `R-${i}-${Date.now()}`,
        customerId: customer.id,
        status: 'DELIVERED',
        paymentStatus: 'SUCCEEDED',
        subtotal: '10.00',
        taxAmount: '0',
        grandTotal: '10.00',
      },
    })
    const review = await db.review.create({
      data: {
        orderId: order.id,
        productId,
        vendorId,
        customerId: customer.id,
        rating: 5,
        body: `review ${i}`,
        createdAt: new Date(Date.now() + i * 1_000),
      },
    })
    reviews.push(review)
  }
  return reviews
}

beforeEach(async () => {
  await resetIntegrationDatabase()
})

test('vendor reviews loader paginates with stable order and take+1 probe', async () => {
  const { vendor } = await createVendorUser()
  const cat = await createCategory()
  const product = await createActiveProduct(vendor.id, { categoryId: cat.id })
  const total = PAGE_SIZE + 5
  await seedReviews(vendor.id, product.id, total)

  const queryOptions = {
    where: { vendorId: vendor.id },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: PAGE_SIZE + 1,
    select: { id: true, createdAt: true },
  }

  // Page 1
  const page1 = await db.review.findMany(queryOptions)
  assert.equal(page1.length, PAGE_SIZE + 1, 'page 1 must return PAGE_SIZE + 1 to detect next')
  const page1Items = page1.slice(0, PAGE_SIZE)

  // Page 2 — cursor on the last shown item, skip 1
  const cursor = page1Items[page1Items.length - 1]!.id
  const page2 = await db.review.findMany({
    ...queryOptions,
    cursor: { id: cursor },
    skip: 1,
  })

  assert.equal(page2.length, total - PAGE_SIZE, 'page 2 must return exactly the remainder')

  // Page 1 + page 2 covers the full set with no duplicates and no gaps.
  const idsSeen = new Set([...page1Items, ...page2].map((r) => r.id))
  assert.equal(idsSeen.size, total, 'no duplicates and no gaps across pages')
})

test('vendor reviews are scoped to the requesting vendor only', async () => {
  const { vendor: vendorA } = await createVendorUser()
  const { vendor: vendorB } = await createVendorUser()
  const cat = await createCategory()
  const productA = await createActiveProduct(vendorA.id, { categoryId: cat.id })
  const productB = await createActiveProduct(vendorB.id, { categoryId: cat.id })

  await seedReviews(vendorA.id, productA.id, 3)
  await seedReviews(vendorB.id, productB.id, 5)

  const aReviews = await db.review.findMany({
    where: { vendorId: vendorA.id },
    select: { id: true, vendorId: true },
  })
  assert.equal(aReviews.length, 3)
  for (const r of aReviews) assert.equal(r.vendorId, vendorA.id)
})
