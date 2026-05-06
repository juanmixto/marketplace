import type { Prisma } from '@/generated/prisma/client'
import type { FulfillmentStatus, IncidentStatus, OrderStatus, PaymentStatus } from '@/generated/prisma/enums'
import { requireAdmin } from '@/lib/auth-guard'
import { auditAdminSearch } from './search-pii'

export interface AdminOrderFilters {
  q?: string
  status?: OrderStatus | 'all'
  payment?: PaymentStatus | 'all'
  incidents?: 'open' | 'all'
  page?: number
  pageSize?: number
}

const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['PLACED', 'PAYMENT_CONFIRMED', 'PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED']
const OPEN_INCIDENT_STATUSES: IncidentStatus[] = ['OPEN', 'AWAITING_VENDOR', 'AWAITING_CUSTOMER', 'AWAITING_ADMIN']

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Pendiente',
  SUCCEEDED: 'Pagado',
  FAILED: 'Fallido',
  REFUNDED: 'Reembolsado',
  PARTIALLY_REFUNDED: 'Reembolso parcial',
}

export const FULFILLMENT_STATUS_LABELS_ADMIN: Record<FulfillmentStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando',
  LABEL_REQUESTED: 'Pidiendo etiqueta',
  LABEL_FAILED: 'Error etiqueta',
  READY: 'Listo',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregado',
  INCIDENT: 'Incidencia',
  CANCELLED: 'Cancelado',
}

function buildOrderWhere(filters: AdminOrderFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {}
  const q = filters.q?.trim()

  if (q) {
    where.OR = [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { customer: { is: { email: { contains: q, mode: 'insensitive' } } } },
      { customer: { is: { firstName: { contains: q, mode: 'insensitive' } } } },
      { customer: { is: { lastName: { contains: q, mode: 'insensitive' } } } },
      { address: { is: { city: { contains: q, mode: 'insensitive' } } } },
      { address: { is: { postalCode: { contains: q, mode: 'insensitive' } } } },
      { shippingAddressSnapshot: { path: ['city'], string_contains: q } },
      { shippingAddressSnapshot: { path: ['postalCode'], string_contains: q } },
      { lines: { some: { product: { is: { name: { contains: q, mode: 'insensitive' } } } } } },
      { fulfillments: { some: { vendor: { is: { displayName: { contains: q, mode: 'insensitive' } } } } } },
    ]
  }

  if (filters.status && filters.status !== 'all') where.status = filters.status
  if (filters.payment && filters.payment !== 'all') where.paymentStatus = filters.payment
  if (filters.incidents === 'open') {
    where.incidents = { some: { status: { in: OPEN_INCIDENT_STATUSES } } }
  }

  return where
}

export async function getAdminOrdersPageData(filters: AdminOrderFilters) {
  // Defense in depth: the /admin/* gate in src/proxy.ts already blocks
  // non-admins, but this loader is plain code and could be imported from
  // anywhere. Guard locally so a future caller can never bypass the gate.
  const session = await requireAdmin()
  const { db } = await import('@/lib/db')
  const where = buildOrderWhere(filters)
  const pageSize = Math.min(Math.max(filters.pageSize ?? 24, 1), 100)
  const page = Math.max(filters.page ?? 1, 1)

  const [orders, totalOrders, activeOrders, pendingPayments, ordersWithIncidents, averageTicket] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: [{ placedAt: 'desc' }, { updatedAt: 'desc' }],
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        address: true,
        lines: {
          include: {
            product: { select: { name: true, slug: true, unit: true, images: true } },
          },
        },
        payments: {
          // #969: cap to 5 most-recent payments per order. Without this
          // an order with many Stripe retries / refund chains could
          // materialize dozens of Payment rows per row × 24 orders per
          // page. The list view only needs the latest; deeper history
          // is on the order-detail page (which queries one order so
          // bounding there is unnecessary).
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        fulfillments: {
          include: { vendor: { select: { id: true, displayName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        incidents: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            type: true,
            status: true,
            resolution: true,
            refundAmount: true,
            slaDeadline: true,
            createdAt: true,
          },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            type: true,
            actorId: true,
            createdAt: true,
          },
        },
      },
    }),
    db.order.count({ where }),
    db.order.count({
      where: {
        ...where,
        status: { in: ACTIVE_ORDER_STATUSES },
      },
    }),
    db.order.count({
      where: {
        ...where,
        paymentStatus: 'PENDING',
      },
    }),
    db.order.count({
      where: {
        ...where,
        incidents: { some: { status: { in: OPEN_INCIDENT_STATUSES } } },
      },
    }),
    db.order.aggregate({
      where,
      _avg: { grandTotal: true },
    }),
  ])

  // #1353 — admins can search the orders page by email / phone /
  // postal code. Without an audit trail, an operator (or a stolen
  // session) can browse the customer base by typing literal PII into
  // the same input that legitimately accepts orderNumber. Hash-only
  // audit so the audit table itself doesn't carry plaintext PII.
  const trimmedQuery = filters.q?.trim()
  if (trimmedQuery) {
    await auditAdminSearch({
      scope: 'admin-orders',
      actorId: session.user.id,
      actorRole: session.user.role,
      query: trimmedQuery,
      matchedCount: totalOrders,
    })
  }

  const statusCounts = orders.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] ?? 0) + 1
    return acc
  }, {})

  const paymentCounts = orders.reduce<Record<string, number>>((acc, order) => {
    acc[order.paymentStatus] = (acc[order.paymentStatus] ?? 0) + 1
    return acc
  }, {})

  return {
    filters,
    orders,
    pagination: {
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalOrders / pageSize)),
      totalOrders,
    },
    stats: {
      totalOrders,
      activeOrders,
      pendingPayments,
      ordersWithIncidents,
      averageTicket: Number(averageTicket._avg.grandTotal ?? 0),
    },
    statusCounts,
    paymentCounts,
  }
}
