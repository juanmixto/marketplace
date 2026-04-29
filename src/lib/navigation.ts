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
  /**
   * When set, the entry is only rendered if the named PostHog flag
   * resolves strictly true (fail-closed). See AppNavItem.flag.
   */
  flag?: string
}

export const vendorNavItems: LocalizedNavItem[] = [
  { href: '/vendor/dashboard',       labelKey: 'vendor.nav.dashboard',     available: true },
  { href: '/vendor/productos',       labelKey: 'vendor.nav.products',      available: true },
  { href: '/vendor/promociones',     labelKey: 'vendor.nav.promotions',    available: true },
  { href: '/vendor/suscripciones',   labelKey: 'vendor.nav.subscriptions', available: true },
  { href: '/vendor/pedidos',         labelKey: 'vendor.nav.orders',        available: true },
  { href: '/vendor/incidencias',     labelKey: 'vendor.nav.incidents',     available: true },
  { href: '/vendor/valoraciones',    labelKey: 'vendor.nav.reviews',       available: true },
  { href: '/vendor/liquidaciones',   labelKey: 'vendor.nav.settlements',   available: true },
  { href: '/vendor/perfil',          labelKey: 'vendor.nav.profile',       available: true },
  { href: '/vendor/ajustes/notificaciones', labelKey: 'vendor.nav.notifications', available: true },
]

export const adminNavItems: LocalizedNavItem[] = [
  { href: '/admin/dashboard',      labelKey: 'admin.nav.dashboard',     available: true },
  { href: '/admin/pedidos',        labelKey: 'admin.nav.orders',        available: true },
  { href: '/admin/usuarios',       labelKey: 'admin.nav.users',         available: true },
  { href: '/admin/productores',    labelKey: 'admin.nav.producers',     available: true },
  { href: '/admin/productos',      labelKey: 'admin.nav.products',      available: true },
  { href: '/admin/promociones',    labelKey: 'admin.nav.promotions',    available: true },
  { href: '/admin/suscripciones',  labelKey: 'admin.nav.subscriptions', available: true },
  { href: '/admin/envios',         labelKey: 'admin.nav.shipments',     available: true },
  { href: '/admin/comisiones',     labelKey: 'admin.nav.commissions',   available: true },
  { href: '/admin/configuracion',  labelKey: 'admin.nav.settings',      available: true },
  { href: '/admin/auditoria',      labelKey: 'admin.nav.audit',         available: true },
  { href: '/admin/liquidaciones',  labelKey: 'admin.nav.settlements',   available: true },
  { href: '/admin/incidencias',    labelKey: 'admin.nav.incidents',     available: true },
  { href: '/admin/informes',       labelKey: 'admin.nav.reports',       available: true },
  { href: '/admin/analytics',      labelKey: 'admin.nav.analytics',     available: true },
  { href: '/admin/notificaciones', labelKey: 'admin.nav.notifications', available: true },
  { href: '/admin/ingestion',      labelKey: 'admin.nav.ingestion',     available: true, flag: 'feat-ingestion-admin' },
]

export const buyerAccountItems: LocalizedNavItem[] = [
  { href: '/cuenta/pedidos',        labelKey: 'account.nav.orders.label',        available: true },
  { href: '/cuenta/suscripciones',  labelKey: 'account.nav.subscriptions.label', available: true },
  { href: '/cuenta/direcciones',    labelKey: 'account.nav.addresses.label',     available: true },
  { href: '/cuenta/favoritos',      labelKey: 'account.nav.favorites.label',     available: true },
  { href: '/cuenta/perfil',         labelKey: 'account.nav.profile.label',       available: true },
  { href: '/cuenta/notificaciones', labelKey: 'account.nav.notifications.label', available: true },
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
