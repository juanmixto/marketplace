import { ArrowPathIcon, HeartIcon, MapPinIcon, ShoppingBagIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import type { TranslationKeys } from '@/i18n/locales'

export interface AppNavItem {
  href: string
  label: string
  available: boolean
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
  { href: '/cuenta/suscripciones', label: 'Mis suscripciones', available: true },
  { href: '/cuenta/direcciones', label: 'Mis direcciones', available: true },
  { href: '/cuenta/favoritos', label: 'Mis favoritos', available: true },
  { href: '/cuenta/perfil', label: 'Datos personales', available: true },
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
} as const

export function getAvailableNavItems<T extends { available: boolean }>(items: T[]): T[] {
  return items.filter(item => item.available)
}

export function getUpcomingNavItems<T extends { available: boolean }>(items: T[]): T[] {
  return items.filter(item => !item.available)
}
