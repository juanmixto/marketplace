export interface AppNavItem {
  href: string
  label: string
  available: boolean
}

export const vendorNavItems: AppNavItem[] = [
  { href: '/vendor/dashboard', label: 'Inicio', available: true },
  { href: '/vendor/productos', label: 'Mi catalogo', available: true },
  { href: '/vendor/pedidos', label: 'Mis pedidos', available: false },
  { href: '/vendor/liquidaciones', label: 'Liquidaciones', available: false },
  { href: '/vendor/perfil', label: 'Mi perfil', available: false },
]

export const adminNavItems: AppNavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', available: true },
  { href: '/admin/pedidos', label: 'Pedidos', available: false },
  { href: '/admin/productores', label: 'Productores', available: false },
  { href: '/admin/productos', label: 'Productos', available: false },
  { href: '/admin/liquidaciones', label: 'Liquidaciones', available: false },
  { href: '/admin/incidencias', label: 'Incidencias', available: false },
  { href: '/admin/informes', label: 'Informes', available: false },
]

export const buyerAccountItems: AppNavItem[] = [
  { href: '/cuenta/pedidos', label: 'Mis pedidos', available: true },
  { href: '/cuenta/direcciones', label: 'Mis direcciones', available: false },
  { href: '/cuenta/perfil', label: 'Datos personales', available: false },
]

export function getAvailableNavItems(items: AppNavItem[]) {
  return items.filter(item => item.available)
}

export function getUpcomingNavItems(items: AppNavItem[]) {
  return items.filter(item => !item.available)
}
