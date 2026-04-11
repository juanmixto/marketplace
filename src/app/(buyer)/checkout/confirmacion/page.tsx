import { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { requireAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { parseOrderAddressSnapshot } from '@/types/order'

export const metadata: Metadata = {
  title: 'Pedido Confirmado | Mercado Productor',
  description: '¡Tu pedido ha sido confirmado exitosamente!',
}

interface ConfirmacionPageProps {
  searchParams: Promise<{ orderNumber?: string }>
}

export default async function Confirmacion({ searchParams }: ConfirmacionPageProps) {
  const session = await requireAuth()
  const params = await searchParams
  const orderNumber = params.orderNumber

  if (!orderNumber) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Pedido no encontrado</h1>
          <p className="mt-2 text-[var(--foreground-soft)]">No se especificó un número de pedido válido.</p>
          <Link href="/productos" className="mt-4 inline-block text-emerald-600 hover:underline dark:text-emerald-400">
            Continuar comprando
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
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Acceso denegado</h1>
          <p className="mt-2 text-[var(--foreground-soft)]">No tienes permiso para ver este pedido.</p>
          <Link href="/productos" className="mt-4 inline-block text-emerald-600 hover:underline dark:text-emerald-400">
            Volver al catálogo
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

  const orderDate = new Date(order.placedAt).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Success Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
            <CheckCircleIcon className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--foreground)]">¡Pedido confirmado!</h1>
          <p className="mt-2 text-[var(--foreground-soft)]">
            Hemos recibido tu pedido y te enviaremos un seguimiento en breve.
          </p>
        </div>

        {/* Order Details Card */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
          {/* Order Number & Date */}
          <div className="mb-6 border-b border-[var(--border)] pb-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-[var(--muted)]">Número de pedido</p>
                <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{order.orderNumber}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--muted)]">Fecha</p>
                <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{orderDate}</p>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="mb-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Productos</h2>
            <div className="space-y-3">
              {order.lines.map((line) => (
                <div key={line.id} className="flex justify-between text-sm">
                  <div>
                    <p className="font-medium text-[var(--foreground)]">{line.product.name}</p>
                    <p className="text-[var(--muted)]">Cantidad: {line.quantity}</p>
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
                <span className="text-[var(--muted)]">Subtotal</span>
                <span className="text-[var(--foreground)]">€{Number(order.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">Impuestos</span>
                <span className="text-[var(--foreground)]">€{Number(order.taxAmount).toFixed(2)}</span>
              </div>
              {Number(order.shippingCost) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted)]">Envío</span>
                  <span className="text-[var(--foreground)]">€{Number(order.shippingCost).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-[var(--border)] pt-2 font-semibold">
                <span className="text-[var(--foreground)]">Total</span>
                <span className="text-emerald-600 dark:text-emerald-400">€{Number(order.grandTotal).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          {orderAddress && (
            <div className="mb-6 rounded-lg bg-[var(--surface-raised)] p-4">
              <h3 className="mb-2 font-semibold text-[var(--foreground)]">Dirección de envío</h3>
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
            <h3 className="mb-1 font-semibold text-blue-900 dark:text-blue-200">Estado del pedido</h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {(order.status === 'PLACED' || order.status === 'PAYMENT_CONFIRMED') && '📦 Pago confirmado. Ya estamos preparando tu pedido y te avisaremos cuando salga de camino.'}
              {order.status === 'PROCESSING' && '⚙️ Nuestros productores están preparando tu pedido.'}
              {order.status === 'SHIPPED' && '🚚 Tu pedido está en camino.'}
              {order.status === 'DELIVERED' && '✅ Tu pedido ha sido entregado.'}
              {order.status === 'CANCELLED' && '❌ Este pedido ha sido cancelado.'}
            </p>
            <p className="mt-3 text-xs text-blue-600 dark:text-blue-400">
              Recibirás notificaciones sobre el progreso de tu pedido en tu email.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/cuenta/pedidos"
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              Ver mis pedidos
            </Link>
            <Link
              href="/productos"
              className="flex-1 rounded-lg border-2 border-emerald-600 px-4 py-3 text-center font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:border-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            >
              Continuar comprando
            </Link>
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-[var(--foreground)]">¿Necesitas ayuda?</h2>
          <p className="mb-3 text-sm text-[var(--foreground-soft)]">
            Si tienes algún problema con tu pedido o necesitas contactarnos:
          </p>
          <div className="flex flex-col gap-2 text-sm">
            <Link href="/contacto" className="text-emerald-600 hover:underline dark:text-emerald-400">
              📧 Contáctanos
            </Link>
            <Link href="/faq" className="text-emerald-600 hover:underline dark:text-emerald-400">
              ❓ Preguntas frecuentes
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
