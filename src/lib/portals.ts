import type { UserRole } from '@/generated/prisma/enums'

export interface PortalLink {
  href: string
  label: string
  description: string
}

export const publicPortalLinks: PortalLink[] = [
  {
    href: '/productos',
    label: 'Comprar',
    description: 'Explora el catálogo público y compra como cliente.',
  },
  {
    href: '/login?callbackUrl=%2Fvendor%2Fdashboard',
    label: 'Soy productor',
    description: 'Entra a tu panel para gestionar catálogo, pedidos y cobros.',
  },
  {
    href: '/login?callbackUrl=%2Fadmin%2Fdashboard',
    label: 'Admin',
    description: 'Accede al dashboard administrativo con un usuario autorizado.',
  },
]

export function getPrimaryPortalHref(role?: UserRole) {
  if (role === 'VENDOR') return '/vendor/dashboard'
  if (role?.startsWith('ADMIN') || role === 'SUPERADMIN') return '/admin/dashboard'
  return '/cuenta'
}
