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

export const LAST_PORTAL_COOKIE = 'mp_last_portal'
export const LAST_PORTAL_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

export function isValidPortalMode(value: unknown): value is LoginPortalMode {
  return value === 'buyer' || value === 'vendor' || value === 'admin'
}

export const STOREFRONT_PATH = '/'
const DEFAULT_ACCOUNT_PATH = '/cuenta'
const LOGIN_PATH = '/login'
const REGISTER_PATH = '/register'

// Allowlist of path prefixes that may be used as a post-login callback.
// Anything outside this list is rejected by sanitizeCallbackUrl.
const CALLBACK_ALLOWED_PREFIXES = [
  '/',
  '/cuenta',
  '/carrito',
  '/checkout',
  '/productos',
  '/productores',
  '/vendor',
  '/admin',
] as const

// Characters that must never appear in a callback path: control chars,
// backslashes (some browsers normalize `\` → `/`), and `@` (userinfo
// confusion against `new URL` parsers).
// eslint-disable-next-line no-control-regex
const CALLBACK_FORBIDDEN_CHARS = /[\x00-\x1f\x7f\\@]/

export type CallbackRejectionReason =
  | 'empty'
  | 'not_relative'
  | 'protocol_relative'
  | 'forbidden_chars'
  | 'login_or_register'
  | 'decode_failed'
  | 'scheme_after_decode'
  | 'not_in_allowlist'
  | 'role_mismatch'

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

export interface AvailablePortal {
  mode: LoginPortalMode
  href: string
  titleKey: 'portalSwitcher.buyer.title' | 'portalSwitcher.vendor.title' | 'portalSwitcher.admin.title'
  descKey: 'portalSwitcher.buyer.desc' | 'portalSwitcher.vendor.desc' | 'portalSwitcher.admin.desc'
}

/**
 * Returns the list of portals a given role has access to. Buyer access is
 * implicit for every authenticated user (any role can also shop). Vendor
 * access requires the VENDOR role. Admin access requires any ADMIN_* role.
 *
 * Used by the portal switcher dropdown in vendor/admin headers — it
 * renders only when the list has ≥2 entries (there's nothing to switch
 * to for a pure CUSTOMER).
 */
export function getAvailablePortals(role?: UserRole): AvailablePortal[] {
  if (!role) return []
  const portals: AvailablePortal[] = [
    {
      mode: 'buyer',
      href: DEFAULT_ACCOUNT_PATH,
      titleKey: 'portalSwitcher.buyer.title',
      descKey: 'portalSwitcher.buyer.desc',
    },
  ]
  if (isVendor(role)) {
    portals.push({
      mode: 'vendor',
      href: '/vendor/dashboard',
      titleKey: 'portalSwitcher.vendor.title',
      descKey: 'portalSwitcher.vendor.desc',
    })
  }
  if (isAdmin(role)) {
    portals.push({
      mode: 'admin',
      href: '/admin/dashboard',
      titleKey: 'portalSwitcher.admin.title',
      descKey: 'portalSwitcher.admin.desc',
    })
  }
  return portals
}

/**
 * Returns the reason a candidate callback URL would be rejected, or null
 * if it passes all structural checks. Kept separate from sanitizeCallbackUrl
 * so callers that need to emit telemetry can do so without parsing twice.
 *
 * This function is edge-safe: it uses only String and URL primitives and
 * does not import logger, db, or any Node-only module.
 */
export function describeCallbackRejection(
  callbackUrl?: string | null
): CallbackRejectionReason | null {
  if (!callbackUrl) return 'empty'
  if (!callbackUrl.startsWith('/')) return 'not_relative'
  if (callbackUrl.startsWith('//')) return 'protocol_relative'
  if (CALLBACK_FORBIDDEN_CHARS.test(callbackUrl)) return 'forbidden_chars'
  if (callbackUrl.startsWith(LOGIN_PATH) || callbackUrl.startsWith(REGISTER_PATH)) {
    return 'login_or_register'
  }

  // Decode twice to detect double-encoded attacks (%252f%252fevil.com).
  let decoded: string
  try {
    decoded = decodeURIComponent(callbackUrl)
    decoded = decodeURIComponent(decoded)
  } catch {
    return 'decode_failed'
  }
  if (CALLBACK_FORBIDDEN_CHARS.test(decoded)) return 'forbidden_chars'
  if (decoded.startsWith('//')) return 'protocol_relative'
  // After decoding, no scheme should appear. `javascript:`, `data:`, `http:`
  // etc. are all caught by looking for a colon before the first slash.
  const firstSlash = decoded.indexOf('/')
  const firstColon = decoded.indexOf(':')
  if (firstColon !== -1 && (firstSlash === -1 || firstColon < firstSlash)) {
    return 'scheme_after_decode'
  }

  // Path must start with one of the allowed prefixes.
  const pathOnly = decoded.split('?')[0]!.split('#')[0]!
  const allowed = CALLBACK_ALLOWED_PREFIXES.some(prefix => {
    if (prefix === '/') return pathOnly === '/'
    return pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)
  })
  if (!allowed) return 'not_in_allowlist'

  return null
}

export function sanitizeCallbackUrl(callbackUrl?: string | null) {
  return describeCallbackRejection(callbackUrl) === null ? callbackUrl! : undefined
}

export interface ResolvePostLoginOptions {
  /**
   * Optional callback invoked when a structurally valid callback URL is
   * rejected because it does not match the authenticated user's role.
   * Kept as a callback (instead of importing logger here) so this module
   * stays edge-safe and can be pulled into the middleware runtime.
   */
  onRoleMismatch?: (details: {
    callbackUrl: string
    callbackMode: LoginPortalMode
    roleMode: LoginPortalMode
  }) => void
  /**
   * The last portal the user explicitly switched to (via the portal
   * switcher). When present and the user has access to that portal, we
   * prefer it over the role-based primary destination. No effect when a
   * callback URL is provided — explicit callbacks always win.
   */
  lastPortal?: LoginPortalMode | null
}

export function resolvePostLoginDestination(
  role?: UserRole,
  callbackUrl?: string | null,
  options: ResolvePostLoginOptions = {}
) {
  const safeCallbackUrl = sanitizeCallbackUrl(callbackUrl)

  if (safeCallbackUrl) {
    const callbackMode = getLoginPortalMode(safeCallbackUrl)
    const roleMode = getPortalModeForRole(role)

    if (!role || callbackMode === roleMode) {
      return safeCallbackUrl
    }

    options.onRoleMismatch?.({
      callbackUrl: safeCallbackUrl,
      callbackMode,
      roleMode,
    })
  }

  // Honor lastPortal preference when the user has access to it. A VENDOR
  // who was browsing the storefront and then logs in again should land
  // back on /cuenta (not /vendor/dashboard) — the switcher is the source
  // of truth for "which portal am I actively using right now".
  if (role && options.lastPortal) {
    const available = getAvailablePortals(role)
    const match = available.find(p => p.mode === options.lastPortal)
    if (match) return match.href
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
