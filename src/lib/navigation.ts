export interface AppNavItem {
  href: string
  label: string
  available: boolean
}

export const vendorNavItems: AppNavItem[] = [
  { href: '/vendor/dashboard', label: 'Inicio', available: true },
  { href: '/vendor/productos', label: 'Mi catalogo', available: true },
  { href: '/vendor/pedidos', label: 'Mis pedidos', available: true },
  { href: '/vendor/liquidaciones', label: 'Liquidaciones', available: false },
  { href: '/vendor/perfil', label: 'Mi perfil', available: true },
]

export const adminNavItems: AppNavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', available: true },
  { href: '/admin/pedidos', label: 'Pedidos', available: true },
  { href: '/admin/productores', label: 'Productores', available: true },
  { href: '/admin/productos', label: 'Productos', available: true },
  { href: '/admin/envios', label: 'Envios', available: true },
  { href: '/admin/comisiones', label: 'Comisiones', available: true },
  { href: '/admin/configuracion', label: 'Configuracion', available: true },
  { href: '/admin/auditoria', label: 'Auditoria', available: true },
  { href: '/admin/liquidaciones', label: 'Liquidaciones', available: true },
  { href: '/admin/incidencias', label: 'Incidencias', available: true },
  { href: '/admin/informes', label: 'Informes', available: true },
]

export const buyerAccountItems: AppNavItem[] = [
  { href: '/cuenta/pedidos', label: 'Mis pedidos', available: true },
  { href: '/cuenta/direcciones', label: 'Mis direcciones', available: true },
  { href: '/cuenta/favoritos', label: 'Mis favoritos', available: true },
  { href: '/cuenta/perfil', label: 'Datos personales', available: false },
]

export function getAvailableNavItems(items: AppNavItem[]) {
  return items.filter(item => item.available)
}

export function getUpcomingNavItems(items: AppNavItem[]) {
  return items.filter(item => !item.available)
}
