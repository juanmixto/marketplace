import type { UserRole } from '@/generated/prisma/enums'

export interface PortalLink {
  href: string
  label: string
  description: string
}

export type LoginPortalMode = 'buyer' | 'vendor' | 'admin'

export const STOREFRONT_PATH = '/'
const DEFAULT_ACCOUNT_PATH = '/cuenta'
const LOGIN_PATH = '/login'
const REGISTER_PATH = '/register'

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
  return DEFAULT_ACCOUNT_PATH
}

export function getPortalLabel(role?: UserRole) {
  if (role === 'VENDOR') return 'Panel productor'
  if (role?.startsWith('ADMIN') || role === 'SUPERADMIN') return 'Panel admin'
  return 'Mi cuenta'
}

export function sanitizeCallbackUrl(callbackUrl?: string | null) {
  if (!callbackUrl) return undefined
  if (!callbackUrl.startsWith('/') || callbackUrl.startsWith('//')) return undefined
  if (callbackUrl.startsWith(LOGIN_PATH) || callbackUrl.startsWith(REGISTER_PATH)) return undefined
  return callbackUrl
}

export function resolvePostLoginDestination(role?: UserRole, callbackUrl?: string | null) {
  return sanitizeCallbackUrl(callbackUrl) ?? (role ? getPrimaryPortalHref(role) : STOREFRONT_PATH)
}

export function normalizeAuthRedirectUrl(url?: string | null) {
  if (!url) return undefined

  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }

    return parsed.toString()
  } catch {
    return sanitizeCallbackUrl(url)
  }
}

export function getLoginPortalMode(callbackUrl?: string | null): LoginPortalMode {
  const safeCallbackUrl = sanitizeCallbackUrl(callbackUrl)

  if (safeCallbackUrl?.startsWith('/vendor')) return 'vendor'
  if (safeCallbackUrl?.startsWith('/admin')) return 'admin'
  return 'buyer'
}
