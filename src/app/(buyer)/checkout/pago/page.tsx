import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { getOrderDetail } from '@/domains/orders/actions'
import { stripeCheckoutParamsSchema, isMockClientSecret } from '@/domains/payments/checkout'
import { StripeCheckoutForm } from '@/components/checkout/StripeCheckoutForm'
import { formatPrice } from '@/lib/utils'
import { getServerEnv } from '@/lib/env'
import type { Metadata } from 'next'

interface Props {
  searchParams: Promise<{ orderId?: string; secret?: string }>
}

export const metadata: Metadata = { title: 'Pago del pedido' }

export default async function CheckoutPaymentPage({ searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const env = getServerEnv()

  if (env.paymentProvider === 'mock') {
    redirect('/checkout')
  }

  const parsed = stripeCheckoutParamsSchema.safeParse(await searchParams)
  if (!parsed.success || isMockClientSecret(parsed.data.secret)) {
    redirect('/checkout')
  }

  const order = await getOrderDetail(parsed.data.orderId)
  if (!order) notFound()

  const payment = order.payments.find(
    item => item.providerRef && parsed.data.secret.startsWith(`${item.providerRef}_secret`)
  )

  if (!payment) {
    redirect('/checkout')
  }

  if (payment.status === 'SUCCEEDED') {
    redirect(`/checkout/confirmacion?orderNumber=${encodeURIComponent(order.orderNumber)}`)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-5">
        <p className="text-sm font-medium text-[var(--foreground)]">Resumen rápido</p>
        <div className="mt-3 grid gap-3 text-sm text-[var(--foreground-soft)] sm:grid-cols-3">
          <div>
            <p className="text-[var(--muted)]">Pedido</p>
            <p className="font-medium text-[var(--foreground)]">{order.orderNumber}</p>
          </div>
          <div>
            <p className="text-[var(--muted)]">Estado</p>
            <p className="font-medium text-[var(--foreground)]">{order.paymentStatus}</p>
          </div>
          <div>
            <p className="text-[var(--muted)]">Total</p>
            <p className="font-medium text-[var(--foreground)]">{formatPrice(Number(order.grandTotal))}</p>
          </div>
        </div>
      </div>

      <StripeCheckoutForm
        clientSecret={parsed.data.secret}
        orderId={order.id}
        orderNumber={order.orderNumber}
        grandTotal={Number(order.grandTotal)}
        appUrl={env.appUrl}
      />
    </div>
  )
}
