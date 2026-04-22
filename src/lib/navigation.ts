import { ArrowPathIcon, BellIcon, HeartIcon, MapPinIcon, ShoppingBagIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import type { TranslationKeys } from '@/i18n/locales'

export interface AppNavItem {
  href: string
  label: string
  available: boolean
  /**
   * When set, the entry is only rendered if the named PostHog flag
   * resolves strictly true (fail-closed). Route-level authz already
   * rejects unauthorised access; this keeps the link itself out of
   * the nav for users without the flag so pre-GA surfaces don't leak.
   */
  flag?: string
}

export interface LocalizedNavItem {
  href: string
  labelKey: TranslationKeys
  available: boolean
}

export const vendorNavItems: LocalizedNavItem[] = [
  { href: '/vendor/dashboard',       labelKey: 'vendor.nav.dashboard',     available: true },
  { href: '/vendor/productos',       labelKey: 'vendor.nav.products',      available: true },
  { href: '/vendor/promociones',     labelKey: 'vendor.nav.promotions',    available: true },
  { href: '/vendor/suscripciones',   labelKey: 'vendor.nav.subscriptions', available: true },
  { href: '/vendor/pedidos',         labelKey: 'vendor.nav.orders',        available: true },
  { href: '/vendor/valoraciones',    labelKey: 'vendor.nav.reviews',       available: true },
  { href: '/vendor/liquidaciones',   labelKey: 'vendor.nav.settlements',   available: true },
  { href: '/vendor/perfil',          labelKey: 'vendor.nav.profile',       available: true },
  { href: '/vendor/ajustes/notificaciones', labelKey: 'vendor.nav.notifications', available: true },
]

export const adminNavItems: AppNavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', available: true },
  { href: '/admin/pedidos', label: 'Orders', available: true },
  { href: '/admin/usuarios', label: 'Users', available: true },
  { href: '/admin/productores', label: 'Producers', available: true },
  { href: '/admin/productos', label: 'Products', available: true },
  { href: '/admin/promociones', label: 'Promotions', available: true },
  { href: '/admin/suscripciones', label: 'Subscriptions', available: true },
  { href: '/admin/envios', label: 'Shipping', available: true },
  { href: '/admin/comisiones', label: 'Commissions', available: true },
  { href: '/admin/configuracion', label: 'Settings', available: true },
  { href: '/admin/auditoria', label: 'Audit', available: true },
  { href: '/admin/liquidaciones', label: 'Settlements', available: true },
  { href: '/admin/incidencias', label: 'Incidents', available: true },
  { href: '/admin/informes', label: 'Reports', available: true },
  { href: '/admin/analytics', label: 'Analytics', available: true },
  { href: '/admin/notificaciones', label: 'Notifications', available: true },
  { href: '/admin/ingestion', label: 'Telegram ingestion', available: true },
]

export const buyerAccountItems: AppNavItem[] = [
  { href: '/cuenta/pedidos', label: 'Mis pedidos', available: true },
  { href: '/cuenta/suscripciones', label: 'Mis suscripciones', available: true },
  { href: '/cuenta/direcciones', label: 'Mis direcciones', available: true },
  { href: '/cuenta/favoritos', label: 'Mis favoritos', available: true },
  { href: '/cuenta/perfil', label: 'Datos personales', available: true },
  { href: '/cuenta/notificaciones', label: 'Notificaciones', available: true },
]

export const buyerAccountMeta = {
  '/cuenta/pedidos': {
    icon: ShoppingBagIcon,
    labelKey: 'account.nav.orders.label',
    descKey:  'account.nav.orders.desc',
  },
  '/cuenta/suscripciones': {
    icon: ArrowPathIcon,
    labelKey: 'account.nav.subscriptions.label',
    descKey:  'account.nav.subscriptions.desc',
  },
  '/cuenta/direcciones': {
    icon: MapPinIcon,
    labelKey: 'account.nav.addresses.label',
    descKey:  'account.nav.addresses.desc',
  },
  '/cuenta/favoritos': {
    icon: HeartIcon,
    labelKey: 'account.nav.favorites.label',
    descKey:  'account.nav.favorites.desc',
  },
  '/cuenta/perfil': {
    icon: UserCircleIcon,
    labelKey: 'account.nav.profile.label',
    descKey:  'account.nav.profile.desc',
  },
  '/cuenta/notificaciones': {
    icon: BellIcon,
    labelKey: 'account.nav.notifications.label',
    descKey:  'account.nav.notifications.desc',
  },
} as const

export function getAvailableNavItems<T extends { available: boolean }>(items: T[]): T[] {
  return items.filter(item => item.available)
}

export function getUpcomingNavItems<T extends { available: boolean }>(items: T[]): T[] {
  return items.filter(item => !item.available)
}
