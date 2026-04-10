import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowPathIcon, ExclamationTriangleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  FULFILLMENT_STATUS_LABELS_ADMIN,
  PAYMENT_STATUS_LABELS,
  getAdminOrdersPageData,
} from '@/domains/admin/orders'
import { getOrderStatusTone } from '@/domains/admin/overview'
import { parseOrderLineSnapshot } from '@/domains/orders/order-line-snapshot'
import { ORDER_STATUS_LABELS } from '@/lib/constants'
import { cn, formatDate, formatPrice, truncate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Pedidos | Admin' }
export const revalidate = 30

const ORDER_STATUS_OPTIONS = ['PLACED', 'PAYMENT_CONFIRMED', 'PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'] as const
const PAYMENT_STATUS_OPTIONS = ['PENDING', 'SUCCEEDED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const

interface Props {
  searchParams: Promise<{
    q?: string
    status?: string
    payment?: string
    order?: string
    page?: string
  }>
}

function getPaymentTone(status: keyof typeof PAYMENT_STATUS_LABELS) {
  switch (status) {
    case 'SUCCEEDED':
      return 'emerald'
    case 'PENDING':
    case 'PARTIALLY_REFUNDED':
      return 'amber'
    case 'FAILED':
      return 'red'
    case 'REFUNDED':
    default:
      return 'slate'
  }
}

function getFulfillmentTone(status: keyof typeof FULFILLMENT_STATUS_LABELS_ADMIN) {
  switch (status) {
    case 'DELIVERED':
      return 'emerald'
    case 'SHIPPED':
      return 'blue'
    case 'CANCELLED':
      return 'red'
    case 'PENDING':
    case 'CONFIRMED':
    case 'PREPARING':
    case 'READY':
    default:
      return 'amber'
  }
}

function formatEventLabel(type: string) {
  switch (type) {
    case 'PAYMENT_CONFIRMED':
      return 'Pago confirmado'
    case 'PAYMENT_FAILED':
      return 'Pago fallido'
    case 'ORDER_CREATED':
      return 'Pedido creado'
    case 'FULFILLMENT_SHIPPED':
      return 'Envío marcado como enviado'
    case 'FULFILLMENT_DELIVERED':
      return 'Entrega confirmada'
    default:
      return type.replaceAll('_', ' ').toLowerCase()
  }
}

function buildOrderHref(baseParams: { q?: string; status?: string; payment?: string }, orderId: string) {
  const params = new URLSearchParams()
  if (baseParams.q) params.set('q', baseParams.q)
  if (baseParams.status && baseParams.status !== 'all') params.set('status', baseParams.status)
  if (baseParams.payment && baseParams.payment !== 'all') params.set('payment', baseParams.payment)
  params.set('order', orderId)
  return `/admin/pedidos?${params.toString()}`
}

function buildPageHref(baseParams: { q?: string; status?: string; payment?: string; order?: string }, page: number) {
  const params = new URLSearchParams()
  if (baseParams.q) params.set('q', baseParams.q)
  if (baseParams.status && baseParams.status !== 'all') params.set('status', baseParams.status)
  if (baseParams.payment && baseParams.payment !== 'all') params.set('payment', baseParams.payment)
  if (baseParams.order) params.set('order', baseParams.order)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/admin/pedidos?${query}` : '/admin/pedidos'
}

export default async function AdminOrdersPage({ searchParams }: Props) {
  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const status = params.status === '' ? 'all' : params.status
  const payment = params.payment === '' ? 'all' : params.payment
  const page = Number.isFinite(Number(params.page)) ? Math.max(Number(params.page), 1) : 1

  const data = await getAdminOrdersPageData({
    q,
    status: ORDER_STATUS_OPTIONS.includes((status ?? 'all') as typeof ORDER_STATUS_OPTIONS[number]) ? (status as typeof ORDER_STATUS_OPTIONS[number]) : 'all',
    payment: PAYMENT_STATUS_OPTIONS.includes((payment ?? 'all') as typeof PAYMENT_STATUS_OPTIONS[number]) ? (payment as typeof PAYMENT_STATUS_OPTIONS[number]) : 'all',
    page,
  })

  const selectedOrder = data.orders.find(order => order.id === params.order) ?? data.orders[0] ?? null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Operaciones</p>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Pedidos</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
            Vista operativa centralizada para revisar pago, envío, incidencias, desglose económico y contexto multi-vendor sin salir del panel.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-right text-sm text-[var(--muted)] shadow-sm">
          <p>{data.stats.totalOrders} pedidos en el resultado actual</p>
          <p>{selectedOrder ? `Detalle abierto: ${selectedOrder.orderNumber}` : 'Selecciona un pedido para ver el detalle'}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pedidos activos" value={data.stats.activeOrders} tone="blue" description="En curso o pendientes de entrega" />
        <MetricCard label="Pago pendiente" value={data.stats.pendingPayments} tone="amber" description="Requieren seguimiento de cobro" />
        <MetricCard label="Con incidencia" value={data.stats.ordersWithIncidents} tone="red" description="Pedidos con soporte activo" />
        <MetricCard label="Ticket medio" value={formatPrice(data.stats.averageTicket)} tone="emerald" description="Promedio sobre el filtro actual" />
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-col gap-3 border-b border-[var(--border)] lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Búsqueda y filtros</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Encuentra pedidos por número, cliente, producto, localidad o productor.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            {Object.entries(data.statusCounts).map(([key, value]) => (
              <span key={key} className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1">
                {ORDER_STATUS_LABELS[key] ?? key}: {value}
              </span>
            ))}
          </div>
        </CardHeader>
        <CardBody>
          <form className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr),minmax(0,0.9fr),minmax(0,0.9fr),auto,auto] lg:items-end">
            <Input
              name="q"
              label="Buscar"
              defaultValue={q}
              placeholder="MP-2026, email, ciudad, producto o productor"
            />
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-[var(--foreground-soft)]">Estado del pedido</span>
              <select
                name="status"
                defaultValue={status ?? 'all'}
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="all">Todos</option>
                {ORDER_STATUS_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {ORDER_STATUS_LABELS[option] ?? option}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-[var(--foreground-soft)]">Estado del pago</span>
              <select
                name="payment"
                defaultValue={payment ?? 'all'}
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="all">Todos</option>
                {PAYMENT_STATUS_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {PAYMENT_STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" className="gap-2">
              <MagnifyingGlassIcon className="h-4 w-4" />
              Aplicar
            </Button>
            <Link
              href="/admin/pedidos"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground-soft)] shadow-sm transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Limpiar
            </Link>
          </form>
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr),minmax(360px,0.95fr)]">
        <Card className="overflow-hidden rounded-2xl">
          <CardHeader className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Cola operativa</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Resumen compacto de pago, envío, vendors e incidencias.</p>
            </div>
            <span className="rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
              Página {data.pagination.page} de {data.pagination.totalPages}
            </span>
          </CardHeader>
          <div className="divide-y divide-[var(--border)]">
            {data.orders.map(order => {
              const itemsCount = order.lines.reduce((sum, line) => sum + line.quantity, 0)
              const vendors = [...new Set(order.fulfillments.map(fulfillment => fulfillment.vendor.displayName))]
              const hasTracking = order.fulfillments.some(fulfillment => fulfillment.trackingNumber)
              const openIncident = order.incidents[0]
              const paymentRecord = order.payments[0]

              return (
                <Link
                  key={order.id}
                  href={buildOrderHref({ q, status, payment }, order.id)}
                  className={cn(
                    'block px-5 py-4 transition-colors hover:bg-[var(--surface-raised)]/70',
                    selectedOrder?.id === order.id && 'bg-emerald-50/60 dark:bg-emerald-950/20'
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[var(--foreground)]">{order.orderNumber}</p>
                        <AdminStatusBadge label={ORDER_STATUS_LABELS[order.status] ?? order.status} tone={getOrderStatusTone(order.status)} />
                        <AdminStatusBadge label={PAYMENT_STATUS_LABELS[order.paymentStatus]} tone={getPaymentTone(order.paymentStatus)} />
                        {openIncident && (
                          <AdminStatusBadge label="Incidencia abierta" tone="red" />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {formatDate(order.placedAt, { dateStyle: 'medium', timeStyle: 'short' })} · {order.customer.firstName} {order.customer.lastName}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">{order.customer.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-[var(--foreground)]">{formatPrice(Number(order.grandTotal))}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {itemsCount} item{itemsCount !== 1 ? 's' : ''} · {vendors.length} productor{vendors.length !== 1 ? 'es' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.1fr),minmax(0,0.9fr),auto]">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Productos</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {order.lines.slice(0, 3).map(line => {
                          const snapshot = parseOrderLineSnapshot(line.productSnapshot)
                          return (
                            <span key={line.id} className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs text-[var(--foreground-soft)]">
                              {truncate(snapshot?.name ?? line.product.name, 24)}
                            </span>
                          )
                        })}
                        {order.lines.length > 3 && (
                          <span className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs text-[var(--muted)]">
                            +{order.lines.length - 3} más
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">Fulfillment</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {order.fulfillments.slice(0, 2).map(fulfillment => (
                          <AdminStatusBadge
                            key={fulfillment.id}
                            label={`${fulfillment.vendor.displayName}: ${FULFILLMENT_STATUS_LABELS_ADMIN[fulfillment.status]}`}
                            tone={getFulfillmentTone(fulfillment.status)}
                          />
                        ))}
                        {order.fulfillments.length > 2 && (
                          <span className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs text-[var(--muted)]">
                            +{order.fulfillments.length - 2} vendors
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs text-[var(--muted)]">
                      <p>{hasTracking ? 'Con tracking' : 'Sin tracking'}</p>
                      <p>{paymentRecord?.provider ? `Pago ${paymentRecord.provider}` : 'Sin referencia de pago'}</p>
                    </div>
                  </div>
                </Link>
              )
            })}
            {data.orders.length === 0 && (
              <div className="px-5 py-14 text-center">
                <p className="font-medium text-[var(--foreground)]">No hay pedidos para este filtro.</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Prueba con otro estado, limpia los filtros o busca por email y número de pedido.</p>
              </div>
            )}
          </div>
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-4 text-sm">
              <p className="text-[var(--muted)]">
                Mostrando hasta {data.pagination.pageSize} pedidos por página de un total de {data.pagination.totalOrders}.
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={buildPageHref({ q, status, payment }, data.pagination.page - 1)}
                  aria-disabled={data.pagination.page <= 1}
                  className={cn(
                    'inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 font-medium',
                    data.pagination.page <= 1
                      ? 'pointer-events-none opacity-50'
                      : 'bg-[var(--surface)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]'
                  )}
                >
                  Anterior
                </Link>
                <Link
                  href={buildPageHref({ q, status, payment }, data.pagination.page + 1)}
                  aria-disabled={data.pagination.page >= data.pagination.totalPages}
                  className={cn(
                    'inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 font-medium',
                    data.pagination.page >= data.pagination.totalPages
                      ? 'pointer-events-none opacity-50'
                      : 'bg-[var(--surface)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]'
                  )}
                >
                  Siguiente
                </Link>
              </div>
            </div>
          )}
        </Card>

        <Card className="rounded-2xl xl:sticky xl:top-24 xl:self-start">
          {selectedOrder ? (
            <>
              <CardHeader className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted-light)]">Detalle del pedido</p>
                    <h2 className="mt-1 text-2xl font-bold text-[var(--foreground)]">{selectedOrder.orderNumber}</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Alta {formatDate(selectedOrder.placedAt, { dateStyle: 'medium', timeStyle: 'short' })} · Actualizado {formatDate(selectedOrder.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <AdminStatusBadge label={ORDER_STATUS_LABELS[selectedOrder.status] ?? selectedOrder.status} tone={getOrderStatusTone(selectedOrder.status)} />
                    <AdminStatusBadge label={PAYMENT_STATUS_LABELS[selectedOrder.paymentStatus]} tone={getPaymentTone(selectedOrder.paymentStatus)} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <DetailStat
                    label="Items"
                    value={String(selectedOrder.lines.reduce((sum, line) => sum + line.quantity, 0))}
                    help="Unidades vendidas"
                  />
                  <DetailStat
                    label="Productores"
                    value={String(new Set(selectedOrder.fulfillments.map(fulfillment => fulfillment.vendorId)).size)}
                    help="Vendors implicados"
                  />
                  <DetailStat
                    label="Incidencias"
                    value={String(selectedOrder.incidents.length)}
                    help={selectedOrder.incidents.length > 0 ? 'Revisar soporte' : 'Sin alertas abiertas'}
                  />
                </div>
              </CardHeader>

              <div className="divide-y divide-[var(--border)]">
                <Section title="Cliente y entrega">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="font-medium text-[var(--foreground)]">{selectedOrder.customer.firstName} {selectedOrder.customer.lastName}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">{selectedOrder.customer.email}</p>
                    </div>
                    <div className="text-sm text-[var(--foreground-soft)]">
                      {selectedOrder.address ? (
                        <>
                          <p>{selectedOrder.address.firstName} {selectedOrder.address.lastName}</p>
                          <p>{selectedOrder.address.line1}{selectedOrder.address.line2 ? `, ${selectedOrder.address.line2}` : ''}</p>
                          <p>{selectedOrder.address.postalCode} {selectedOrder.address.city}, {selectedOrder.address.province}</p>
                          <p>{selectedOrder.address.country}{selectedOrder.address.phone ? ` · ${selectedOrder.address.phone}` : ''}</p>
                        </>
                      ) : (
                        <p className="text-[var(--muted)]">Pedido sin dirección guardada.</p>
                      )}
                    </div>
                  </div>
                </Section>

                <Section title="Resumen económico">
                  <div className="space-y-2 text-sm">
                    <PriceRow label="Subtotal" value={Number(selectedOrder.subtotal)} />
                    <PriceRow label="Envío" value={Number(selectedOrder.shippingCost)} freeLabel="Gratis" />
                    <PriceRow label="Impuestos" value={Number(selectedOrder.taxAmount)} />
                    <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-base font-semibold text-[var(--foreground)]">
                      <span>Total</span>
                      <span>{formatPrice(Number(selectedOrder.grandTotal))}</span>
                    </div>
                  </div>
                </Section>

                <Section title="Productos">
                  <div className="space-y-3">
                    {selectedOrder.lines.map(line => {
                      const snapshot = parseOrderLineSnapshot(line.productSnapshot)
                      return (
                        <div key={line.id} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]/60 p-3">
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
                            {line.product.images?.[0]
                              ? <Image src={line.product.images[0]} alt={line.product.name} fill className="object-cover" sizes="56px" />
                              : <div className="flex h-full items-center justify-center text-xl">🌿</div>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-[var(--foreground)]">{snapshot?.name ?? line.product.name}</p>
                              {snapshot?.variantName && (
                                <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs text-[var(--muted)]">{snapshot.variantName}</span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-[var(--muted)]">
                              {snapshot?.vendorName ?? 'Vendor'} · {line.quantity} {line.product.unit}
                            </p>
                            <Link href={`/productos/${line.product.slug}`} className="mt-2 inline-flex text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                              Ver producto
                            </Link>
                          </div>
                          <p className="text-sm font-semibold text-[var(--foreground)]">{formatPrice(Number(line.unitPrice) * line.quantity)}</p>
                        </div>
                      )
                    })}
                  </div>
                </Section>

                <Section title="Fulfillments por productor">
                  <div className="space-y-3">
                    {selectedOrder.fulfillments.map(fulfillment => (
                      <div key={fulfillment.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]/50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-[var(--foreground)]">{fulfillment.vendor.displayName}</p>
                            <p className="mt-1 text-sm text-[var(--muted)]">
                              {fulfillment.carrier ? `${fulfillment.carrier}` : 'Transportista pendiente'}
                              {fulfillment.trackingNumber ? ` · ${fulfillment.trackingNumber}` : ' · sin tracking'}
                            </p>
                          </div>
                          <AdminStatusBadge
                            label={FULFILLMENT_STATUS_LABELS_ADMIN[fulfillment.status]}
                            tone={getFulfillmentTone(fulfillment.status)}
                          />
                        </div>
                        <div className="mt-3 grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-2">
                          <p>Creado {formatDate(fulfillment.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                          <p>{fulfillment.shippedAt ? `Enviado ${formatDate(fulfillment.shippedAt, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Todavía no enviado'}</p>
                          <p>{fulfillment.deliveredAt ? `Entregado ${formatDate(fulfillment.deliveredAt, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Entrega no confirmada'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="Pagos">
                  <div className="space-y-3">
                    {selectedOrder.payments.map(paymentRecord => (
                      <div key={paymentRecord.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]/50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-[var(--foreground)]">{paymentRecord.provider}</p>
                            <p className="mt-1 text-sm text-[var(--muted)]">{paymentRecord.providerRef ?? 'Sin referencia externa'}</p>
                          </div>
                          <div className="text-right">
                            <AdminStatusBadge label={PAYMENT_STATUS_LABELS[paymentRecord.status]} tone={getPaymentTone(paymentRecord.status)} />
                            <p className="mt-1 text-sm font-medium text-[var(--foreground)]">{formatPrice(Number(paymentRecord.amount), paymentRecord.currency)}</p>
                          </div>
                        </div>
                        <p className="mt-3 text-xs text-[var(--muted)]">
                          Creado {formatDate(paymentRecord.createdAt, { dateStyle: 'medium', timeStyle: 'short' })} · Actualizado {formatDate(paymentRecord.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="Incidencias">
                  {selectedOrder.incidents.length > 0 ? (
                    <div className="space-y-3">
                      {selectedOrder.incidents.map(incident => (
                        <div key={incident.id} className="rounded-xl border border-red-200 bg-red-50/70 p-3 dark:border-red-900/60 dark:bg-red-950/20">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-start gap-2">
                              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                              <div>
                                <p className="font-medium text-red-900 dark:text-red-300">{incident.type}</p>
                                <p className="mt-1 text-sm text-red-800/80 dark:text-red-300/90">
                                  SLA {formatDate(incident.slaDeadline, { dateStyle: 'medium', timeStyle: 'short' })}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium text-red-900 dark:text-red-300">{incident.status}</p>
                              <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                                {incident.refundAmount ? `Reembolso ${formatPrice(Number(incident.refundAmount))}` : incident.resolution ?? 'Sin resolución'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--muted)]">No hay incidencias registradas para este pedido.</p>
                  )}
                </Section>

                <Section title="Actividad reciente">
                  {selectedOrder.events.length > 0 ? (
                    <div className="space-y-3">
                      {selectedOrder.events.map(event => (
                        <div key={event.id} className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3 last:border-b-0 last:pb-0">
                          <div>
                            <p className="font-medium capitalize text-[var(--foreground)]">{formatEventLabel(event.type)}</p>
                            <p className="mt-1 text-sm text-[var(--muted)]">
                              {event.actorId ? `Actor ${event.actorId}` : 'Sistema'}
                            </p>
                          </div>
                          <p className="text-right text-xs text-[var(--muted)]">
                            {formatDate(event.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--muted)]">Todavía no hay eventos registrados para este pedido.</p>
                  )}
                </Section>
              </div>
            </>
          ) : (
            <CardBody className="py-14 text-center">
              <p className="font-medium text-[var(--foreground)]">Sin detalle disponible</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Cuando haya resultados, podrás abrir aquí el contexto completo del pedido.</p>
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  description,
  tone,
}: {
  label: string
  value: string | number
  description: string
  tone: 'emerald' | 'amber' | 'red' | 'blue'
}) {
  const toneClasses = {
    emerald: 'text-emerald-700 dark:text-emerald-400',
    amber: 'text-amber-700 dark:text-amber-400',
    red: 'text-red-700 dark:text-red-400',
    blue: 'text-blue-700 dark:text-blue-400',
  }

  return (
    <Card className="rounded-2xl">
      <CardBody>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-light)]">{label}</p>
        <p className={cn('mt-2 text-3xl font-bold', toneClasses[tone])}>{value}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
      </CardBody>
    </Card>
  )
}

function DetailStat({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{help}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-5 py-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function PriceRow({ label, value, freeLabel }: { label: string; value: number; freeLabel?: string }) {
  return (
    <div className="flex items-center justify-between text-[var(--foreground-soft)]">
      <span>{label}</span>
      <span>{value === 0 && freeLabel ? freeLabel : formatPrice(value)}</span>
    </div>
  )
}
