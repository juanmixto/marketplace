/**
 * Synthetic-checkout start endpoint (#1223).
 *
 * Token-gated by `SYNTHETIC_TOKEN`. Creates a synthetic Order +
 * OrderLine against the dedicated synthetic vendor/product (see
 * `src/domains/synthetic-monitor/seed.ts`), returns the IDs the
 * external monitor cron needs to drive a Stripe test-mode payment
 * and assert the webhook lands the row in PAYMENT_CONFIRMED.
 *
 * Out of scope for this route:
 *   - Calling Stripe to confirm the payment intent. The cron does
 *     that with the test card `4242 4242 4242 4242` against the
 *     PaymentIntent it gets back from a separate checkout endpoint
 *     (TODO: wire). For now the route only creates the Order in
 *     `PLACED` so the orchestration shape is testable.
 *   - Cleanup. Synthetic orders > 24h old are nuked by the
 *     `cleanup-abandoned` worker job (#1285 extension).
 *
 * Inert by env: when `SYNTHETIC_TOKEN` is unset, the endpoint
 * returns 503. The cron's first probe simply fails until ops
 * provisions the token — there's no leak path.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { ensureSyntheticMonitor } from '@/domains/synthetic-monitor/seed'
import { trackCreate, SYSTEM } from '@/lib/actor-tracking'

const ORDER_NUMBER_PREFIX = 'SYN'

function unauthorized(): NextResponse {
  // Generic 401 — never reveals whether the token was wrong vs
  // unset. The endpoint must look identical to a "not found" path
  // for any caller without the secret.
  return new NextResponse(null, { status: 401 })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.SYNTHETIC_TOKEN
  if (!expected) {
    // Service unavailable: the cron's job is to alert when probes
    // start failing, so a 503 propagates the "not configured" state
    // out the right channel.
    return new NextResponse(null, { status: 503 })
  }

  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return unauthorized()
  const presented = auth.slice('Bearer '.length).trim()
  if (presented.length === 0 || presented !== expected) return unauthorized()

  try {
    const refs = await ensureSyntheticMonitor()

    const orderNumber = `${ORDER_NUMBER_PREFIX}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`

    const order = await db.$transaction(async tx => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          customerId: refs.customerId,
          status: 'PLACED',
          paymentStatus: 'PENDING',
          subtotal: refs.productPrice,
          taxAmount: '0',
          grandTotal: refs.productPrice,
          synthetic: true,
          ...trackCreate(SYSTEM),
          lines: {
            create: [
              {
                vendorId: refs.vendorId,
                productId: refs.productId,
                quantity: 1,
                unitPrice: refs.productPrice,
                taxRate: '0',
                productSnapshot: {
                  version: 1,
                  id: refs.productId,
                  name: 'Synthetic monitor',
                  slug: 'synthetic-monitor-product',
                  images: [],
                  unit: 'unidad',
                  vendorName: 'Synthetic Monitor',
                },
              },
            ],
          },
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
        },
      })
      return created
    })

    logger.info('synthetic.checkout.created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
    })

    return NextResponse.json(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
      },
      { status: 201 },
    )
  } catch (err) {
    logger.error('synthetic.checkout.failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'synthetic_checkout_failed' },
      { status: 500 },
    )
  }
}
