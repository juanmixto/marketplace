import type {
  IncidentStatus,
  OrderStatus,
  ProductStatus,
  SettlementStatus,
  VendorStatus,
} from '@/generated/prisma/enums'

export function getOrderStatusTone(status: OrderStatus) {
  switch (status) {
    case 'PLACED':
    case 'PAYMENT_CONFIRMED':
    case 'PROCESSING':
      return 'amber'
    case 'SHIPPED':
    case 'PARTIALLY_SHIPPED':
      return 'blue'
    case 'DELIVERED':
      return 'emerald'
    case 'CANCELLED':
    case 'REFUNDED':
      return 'slate'
    default:
      return 'slate'
  }
}

export function getVendorStatusTone(status: VendorStatus) {
  switch (status) {
    case 'ACTIVE':
      return 'emerald'
    case 'APPLYING':
    case 'PENDING_DOCS':
      return 'amber'
    case 'REJECTED':
    case 'SUSPENDED_TEMP':
    case 'SUSPENDED_PERM':
      return 'red'
    default:
      return 'slate'
  }
}

export function getProductStatusTone(status: ProductStatus) {
  switch (status) {
    case 'ACTIVE':
      return 'emerald'
    case 'PENDING_REVIEW':
      return 'amber'
    case 'REJECTED':
    case 'SUSPENDED':
      return 'red'
    case 'DRAFT':
      return 'slate'
    default:
      return 'slate'
  }
}

export function getIncidentStatusTone(status: IncidentStatus) {
  switch (status) {
    case 'OPEN':
    case 'AWAITING_ADMIN':
      return 'red'
    case 'AWAITING_VENDOR':
    case 'AWAITING_CUSTOMER':
      return 'amber'
    case 'RESOLVED':
      return 'emerald'
    case 'CLOSED':
      return 'slate'
    default:
      return 'slate'
  }
}

export function getSettlementStatusTone(status: SettlementStatus) {
  switch (status) {
    case 'DRAFT':
      return 'slate'
    case 'PENDING_APPROVAL':
      return 'amber'
    case 'APPROVED':
      return 'blue'
    case 'PAID':
      return 'emerald'
    default:
      return 'slate'
  }
}

export function getToneClasses(tone: 'amber' | 'blue' | 'emerald' | 'red' | 'slate') {
  switch (tone) {
    case 'amber':
      return 'bg-amber-50 text-amber-700 ring-amber-200'
    case 'blue':
      return 'bg-blue-50 text-blue-700 ring-blue-200'
    case 'emerald':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 'red':
      return 'bg-red-50 text-red-700 ring-red-200'
    case 'slate':
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-200'
  }
}

export function formatAdminPeriodLabel(from: Date, to: Date) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(from) + ' - ' + new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(to)
}
