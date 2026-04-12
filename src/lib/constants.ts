export const SITE_NAME = 'Mercado Productor'
export const SITE_DESCRIPTION = 'Compra directamente a productores locales'

export const TAX_RATES = {
  REDUCED: 0.04,   // productos básicos (leche, pan, frutas, verduras)
  STANDARD: 0.10,  // otros alimentos
  GENERAL: 0.21,   // resto
} as const

export const CERTIFICATIONS = ['ECO-ES', 'DOP', 'KM0', 'BIO', 'IGP'] as const
export type Certification = typeof CERTIFICATIONS[number]

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PLACED: 'Pedido recibido',
  PAYMENT_CONFIRMED: 'Pago confirmado',
  PROCESSING: 'En preparación',
  PARTIALLY_SHIPPED: 'Parcialmente enviado',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pago pendiente',
  SUCCEEDED: 'Pagado',
  FAILED: 'Pago fallido',
  REFUNDED: 'Reembolsado',
  PARTIALLY_REFUNDED: 'Reembolso parcial',
}

export const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando',
  READY: 'Listo para enviar',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
}

export const VENDOR_STATUS_LABELS: Record<string, string> = {
  APPLYING: 'Solicitud',
  PENDING_DOCS: 'Documentación pendiente',
  ACTIVE: 'Activo',
  REJECTED: 'Rechazado',
  SUSPENDED_TEMP: 'Suspendido temporalmente',
  SUSPENDED_PERM: 'Suspendido permanentemente',
}

export const PAGINATION_DEFAULTS = {
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
}

export const SLA_HOURS = 48  // horas para resolver incidencias

export const DEFAULT_COMMISSION_RATE = 0.12  // 12%
