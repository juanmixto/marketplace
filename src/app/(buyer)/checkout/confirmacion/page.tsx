import { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { requireAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { parseOrderAddressSnapshot } from '@/types/order'
import { getServerLocale, getServerT } from '@/i18n/server'
import { PurchaseTracker } from '@/components/analytics/PurchaseTracker'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT()
  return {
    title: t('orderConfirmation.metaTitle'),
    description: t('orderConfirmation.metaDescription'),
  }
}

interface ConfirmacionPageProps {
  searchParams: Promise<{ orderNumber?: string }>
}

export default async function Confirmacion({ searchParams }: ConfirmacionPageProps) {
  const session = await requireAuth()
  const params = await searchParams
  const orderNumber = params.orderNumber
  const t = await getServerT()
  const locale = await getServerLocale()
  const dateLocaleTag = locale === 'en' ? 'en-US' : 'es-ES'

  if (!orderNumber) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('orderConfirmation.notFound')}</h1>
          <p className="mt-2 text-[var(--foreground-soft)]">{t('orderConfirmation.notFoundDesc')}</p>
          <Link href="/productos" className="mt-4 inline-block text-emerald-600 hover:underline dark:text-emerald-400">
            {t('orderConfirmation.continueShopping')}
          </Link>
        </div>
      </main>
    )
  }

  // Fetch order with all details
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: {
      lines: {
        include: { product: true },
      },
      address: true,
      payments: true,
      fulfillments: true,
    },
  })

  // Verify order exists and belongs to current user
  if (!order || order.customerId !== session.user.id) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('orderConfirmation.accessDenied')}</h1>
          <p className="mt-2 text-[var(--foreground-soft)]">{t('orderConfirmation.accessDeniedDesc')}</p>
          <Link href="/productos" className="mt-4 inline-block text-emerald-600 hover:underline dark:text-emerald-400">
            {t('orderConfirmation.backToCatalog')}
          </Link>
        </div>
      </main>
    )
  }
  const orderAddress = parseOrderAddressSnapshot(order.shippingAddressSnapshot) ?? (
    order.address
      ? {
          firstName: order.address.firstName,
          lastName: order.address.lastName,
          line1: order.address.line1,
          line2: order.address.line2,
          city: order.address.city,
          province: order.address.province,
          postalCode: order.address.postalCode,
          phone: order.address.phone,
        }
      : null
  )

  const orderDate = new Date(order.placedAt).toLocaleDateString(dateLocaleTag, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const statusMessage =
    order.status === 'PLACED' || order.status === 'PAYMENT_CONFIRMED'
      ? t('orderConfirmation.statusPlaced')
      : order.status === 'PROCESSING'
        ? t('orderConfirmation.statusProcessing')
        : order.status === 'SHIPPED'
          ? t('orderConfirmation.statusShipped')
          : order.status === 'DELIVERED'
            ? t('orderConfirmation.statusDelivered')
            : order.status === 'CANCELLED'
              ? t('orderConfirmation.statusCancelled')
              : ''

  // #569 — emit a single `purchase` event the first time the buyer
  // lands here for this orderNumber. Any subsequent visit (refresh,
  // replay redirect from a double submit) is deduped on the client
  // by sessionStorage.
  const purchaseItems = order.lines.map(line => ({
    productId: line.productId,
    name: line.product.name,
    price: Number(line.unitPrice),
    quantity: line.quantity,
  }))

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-12 sm:px-6 lg:px-8">
      <PurchaseTracker
        orderId={order.id}
        orderNumber={order.orderNumber}
        currency="EUR"
        revenue={Number(order.grandTotal)}
        tax={Number(order.taxAmount)}
        shipping={Number(order.shippingCost)}
        items={purchaseItems}
      />
      <div className="mx-auto max-w-2xl">
        {/* Success Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
            <CheckCircleIcon className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--foreground)]">{t('orderConfirmation.heading')}</h1>
          <p className="mt-2 text-[var(--foreground-soft)]">{t('orderConfirmation.subheading')}</p>
        </div>

        {/* Order Details Card */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
          {/* Order Number & Date */}
          <div className="mb-6 border-b border-[var(--border)] pb-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-[var(--muted)]">{t('orderConfirmation.orderNumber')}</p>
                <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{order.orderNumber}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--muted)]">{t('orderConfirmation.date')}</p>
                <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{orderDate}</p>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="mb-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">{t('order.products')}</h2>
            <div className="space-y-3">
              {order.lines.map((line) => (
                <div key={line.id} className="flex justify-between text-sm">
                  <div>
                    <p className="font-medium text-[var(--foreground)]">{line.product.name}</p>
                    <p className="text-[var(--muted)]">{t('orderConfirmation.quantityLabel')}: {line.quantity}</p>
                  </div>
                  <p className="font-medium text-[var(--foreground)]">
                    €{(Number(line.unitPrice) * line.quantity).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="mb-6 border-t border-[var(--border)] pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">{t('order.subtotal')}</span>
                <span className="text-[var(--foreground)]">€{Number(order.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">{t('orderConfirmation.taxes')}</span>
                <span className="text-[var(--foreground)]">€{Number(order.taxAmount).toFixed(2)}</span>
              </div>
              {Number(order.shippingCost) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted)]">{t('order.shippingCost')}</span>
                  <span className="text-[var(--foreground)]">€{Number(order.shippingCost).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-[var(--border)] pt-2 font-semibold">
                <span className="text-[var(--foreground)]">{t('order.total')}</span>
                <span className="text-emerald-600 dark:text-emerald-400">€{Number(order.grandTotal).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          {orderAddress && (
            <div className="mb-6 rounded-lg bg-[var(--surface-raised)] p-4">
              <h3 className="mb-2 font-semibold text-[var(--foreground)]">{t('orderConfirmation.shippingAddress')}</h3>
              <p className="text-sm text-[var(--foreground-soft)]">
                {orderAddress.firstName} {orderAddress.lastName}<br />
                {orderAddress.line1}
                {orderAddress.line2 && <><br />{orderAddress.line2}</> }
                <br />
                {orderAddress.city}, {orderAddress.province} {orderAddress.postalCode}
              </p>
            </div>
          )}

          {/* Status */}
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
            <h3 className="mb-1 font-semibold text-blue-900 dark:text-blue-200">{t('orderConfirmation.statusTitle')}</h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">{statusMessage}</p>
            <p className="mt-3 text-xs text-blue-600 dark:text-blue-400">
              {t('orderConfirmation.notificationsHint')}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/cuenta/pedidos"
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              {t('orderConfirmation.viewMyOrders')}
            </Link>
            <Link
              href="/productos"
              className="flex-1 rounded-lg border-2 border-emerald-600 px-4 py-3 text-center font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:border-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            >
              {t('orderConfirmation.continueShopping')}
            </Link>
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-[var(--foreground)]">{t('orderConfirmation.helpTitle')}</h2>
          <p className="mb-3 text-sm text-[var(--foreground-soft)]">
            {t('orderConfirmation.helpDesc')}
          </p>
          <div className="flex flex-col gap-2 text-sm">
            <Link href="/contacto" className="text-emerald-600 hover:underline dark:text-emerald-400">
              {t('orderConfirmation.contactUs')}
            </Link>
            <Link href="/faq" className="text-emerald-600 hover:underline dark:text-emerald-400">
              {t('orderConfirmation.faqLink')}
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
