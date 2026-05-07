/**
 * Synthetic-monitor seed (#1223).
 *
 * Lazily provisions the dedicated vendor / product / customer rows
 * the `/api/test-checkout/start` endpoint creates orders against.
 * Idempotent: every call returns the same set of ids — running the
 * cron 144 times a day produces zero churn beyond the orders the
 * cron itself creates.
 *
 * Why dedicated rows instead of reusing real ones:
 *   - The synthetic order must NOT mutate real customer carts /
 *     vendor settlement totals. A dedicated vendor with `synthetic=true`
 *     is invisible to the real producer directory.
 *   - The synthetic product must NOT appear in the public catalog.
 *     `getAvailableProductWhere` already filters `synthetic=false`.
 *   - The cleanup job can purge synthetic orders > 24h old without
 *     ever touching a real order — the where clause is `synthetic: true`.
 */

import { db } from '@/lib/db'

const VENDOR_USER_EMAIL = 'monitor-vendor@synthetic.invalid'
const VENDOR_SLUG = 'synthetic-monitor-vendor'
const PRODUCT_SLUG = 'synthetic-monitor-product'
const CUSTOMER_EMAIL = 'monitor-customer@synthetic.invalid'

export interface SyntheticMonitorRefs {
  customerId: string
  vendorId: string
  productId: string
  productPrice: string
}

/**
 * Creates the synthetic User / Vendor / Product if missing, returns
 * their ids. Wrapped in `db.$transaction` so a partial create can't
 * leave a half-seeded row that the next call has to dance around.
 */
export async function ensureSyntheticMonitor(): Promise<SyntheticMonitorRefs> {
  return db.$transaction(async tx => {
    // 1. Synthetic customer (CUSTOMER role).
    const customer = await tx.user.upsert({
      where: { email: CUSTOMER_EMAIL },
      update: {},
      create: {
        email: CUSTOMER_EMAIL,
        firstName: 'Synthetic',
        lastName: 'Monitor',
        role: 'CUSTOMER',
        isActive: true,
      },
      select: { id: true },
    })

    // 2. Synthetic vendor user (VENDOR role) — owns the vendor row.
    const vendorUser = await tx.user.upsert({
      where: { email: VENDOR_USER_EMAIL },
      update: {},
      create: {
        email: VENDOR_USER_EMAIL,
        firstName: 'Synthetic',
        lastName: 'Vendor',
        role: 'VENDOR',
        isActive: true,
      },
      select: { id: true },
    })

    // 3. Synthetic vendor — `synthetic: true` keeps it out of the
    // public producers directory.
    const vendor = await tx.vendor.upsert({
      where: { slug: VENDOR_SLUG },
      update: {},
      create: {
        userId: vendorUser.id,
        slug: VENDOR_SLUG,
        displayName: 'Synthetic Monitor (do not contact)',
        status: 'ACTIVE',
        synthetic: true,
        // No Stripe Connect for the synthetic vendor — orders against
        // it stay in PLACED / PAYMENT_CONFIRMED but never settle to a
        // real account. The cron is responsible for asserting the
        // PAYMENT_CONFIRMED transition lands; settlement is out of
        // scope.
        stripeOnboarded: false,
      },
      select: { id: true, userId: true },
    })

    // 4. Default category (always present per schema seed).
    const category = await tx.category.upsert({
      where: { slug: 'uncategorized' },
      update: {},
      create: {
        id: 'cat_uncategorized',
        name: 'Sin categoría',
        slug: 'uncategorized',
        isActive: true,
        sortOrder: 999,
      },
      select: { id: true },
    })

    // 5. Synthetic product — `synthetic: true` keeps it out of the
    // catalog (`getAvailableProductWhere` filters synthetic=false).
    const product = await tx.product.upsert({
      where: { slug: PRODUCT_SLUG },
      update: {},
      create: {
        vendorId: vendor.id,
        categoryId: category.id,
        slug: PRODUCT_SLUG,
        name: 'Synthetic monitor (do not order)',
        // 1.00 EUR keeps Stripe test-mode happy — under any minimum.
        basePrice: '1.00',
        unit: 'unidad',
        stock: 999_999,
        trackStock: false,
        status: 'ACTIVE',
        synthetic: true,
      },
      select: { id: true, basePrice: true },
    })

    return {
      customerId: customer.id,
      vendorId: vendor.id,
      productId: product.id,
      productPrice: product.basePrice.toString(),
    }
  })
}
