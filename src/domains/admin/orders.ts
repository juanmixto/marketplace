import type { Prisma } from '@/generated/prisma/client'
import type { FulfillmentStatus, IncidentStatus, OrderStatus, PaymentStatus } from '@/generated/prisma/enums'

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
