import type { UserRole } from '@/generated/prisma/enums'
import type { Locale, TranslationKeys } from '@/i18n/locales'
import { defaultLocale, locales } from '@/i18n/locales'
import { isAdmin, isVendor } from '@/lib/roles'

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

const CATEGORY_TRANSLATION_KEYS: Partial<Record<string, TranslationKeys>> = {
  verduras: 'cat_verduras',
  frutas: 'cat_frutas',
  lacteos: 'cat_lacteos',
  carnicos: 'cat_carnicos',
  aceites: 'cat_aceites',
  panaderia: 'cat_panaderia',
  vinos: 'cat_vinos',
  miel: 'cat_miel',
}

export function getPublicPortalLinks(locale: Locale = defaultLocale): PortalLink[] {
  const copy = locales[locale] ?? locales[defaultLocale]

  return [
    {
      href: '/productos',
      label: copy.portal_shop_label,
      description: copy.portal_shop_desc,
    },
    {
      href: '/login?callbackUrl=%2Fvendor%2Fdashboard',
      label: copy.portal_vendor_label,
      description: copy.producerPortalDesc,
    },
    {
      href: '/login?callbackUrl=%2Fadmin%2Fdashboard',
      label: copy.admin_panel,
      description: copy.portal_admin_desc,
    },
  ]
}

export const publicPortalLinks: PortalLink[] = getPublicPortalLinks()

export function translateCategoryLabel(slug: string, fallback: string, locale: Locale = defaultLocale) {
  const key = CATEGORY_TRANSLATION_KEYS[slug]
  if (!key) return fallback

  return locales[locale][key] ?? fallback
}

export function getPrimaryPortalHref(role?: UserRole) {
  if (isVendor(role)) return '/vendor/dashboard'
  if (isAdmin(role)) return '/admin/dashboard'
  return DEFAULT_ACCOUNT_PATH
}

export function getPortalLabel(role?: UserRole, locale: Locale = defaultLocale) {
  const copy = locales[locale] ?? locales[defaultLocale]

  if (isVendor(role)) return copy.vendor_panel
  if (isAdmin(role)) return copy.admin_panel
  return copy.myAccount
}

function getPortalModeForRole(role?: UserRole): LoginPortalMode {
  if (isVendor(role)) return 'vendor'
  if (isAdmin(role)) return 'admin'
  return 'buyer'
}

export function sanitizeCallbackUrl(callbackUrl?: string | null) {
  if (!callbackUrl) return undefined
  if (!callbackUrl.startsWith('/') || callbackUrl.startsWith('//')) return undefined
  if (callbackUrl.startsWith(LOGIN_PATH) || callbackUrl.startsWith(REGISTER_PATH)) return undefined
  return callbackUrl
}

export function resolvePostLoginDestination(role?: UserRole, callbackUrl?: string | null) {
  const safeCallbackUrl = sanitizeCallbackUrl(callbackUrl)

  if (safeCallbackUrl) {
    const callbackMode = getLoginPortalMode(safeCallbackUrl)
    const roleMode = getPortalModeForRole(role)

    if (!role || callbackMode === roleMode) {
      return safeCallbackUrl
    }
  }

  return role ? getPrimaryPortalHref(role) : STOREFRONT_PATH
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
