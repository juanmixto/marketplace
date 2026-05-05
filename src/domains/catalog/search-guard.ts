import { isVerifiedSearchBot } from '@/lib/bot-detection'
import { logger } from '@/lib/logger'

type HeaderStore = Pick<Headers, 'get'>

export interface CatalogSearchAccess {
  allowed: boolean
  ip: string | null
  verifiedBot: boolean
  resetAt?: number
}

export interface CatalogSearchGuardInput {
  query: string
  categorySlug?: string | null
  headerStore?: HeaderStore
}

export interface CatalogSearchGuardDeps {
  checkRateLimit?: (
    action: string,
    key: string,
    limit: number,
    windowSeconds: number,
  ) => Promise<{
    success: boolean
    resetAt: number
    message?: string
    degraded?: boolean
  }>
  isVerifiedSearchBot?: typeof isVerifiedSearchBot
  trackServer?: (
    event: string,
    properties: Record<string, unknown>,
    options: { distinctId: string; dedupeKey?: string },
  ) => void | Promise<void>
  logger?: Pick<typeof logger, 'warn'>
}

const SEARCH_RATE_LIMIT = 20
const SEARCH_RATE_WINDOW_SECONDS = 60

async function getRequestHeaders(): Promise<HeaderStore> {
  const { headers } = await import('next/headers')
  return headers()
}

async function defaultCheckRateLimit(
  action: string,
  key: string,
  limit: number,
  windowSeconds: number,
) {
  const { checkRateLimit } = await import('@/lib/ratelimit')
  return checkRateLimit(action, key, limit, windowSeconds)
}

async function defaultTrackServer(
  event: string,
  properties: Record<string, unknown>,
  options: { distinctId: string; dedupeKey?: string },
) {
  const { trackServer } = await import('@/lib/analytics.server')
  trackServer(event, properties, options)
}

function extractCatalogSearchIp(headerStore: HeaderStore): string | null {
  const trustProxy = isProxyTrustedFromEnv()
  if (!trustProxy) {
    return 'untrusted-client'
  }

  const cfConnectingIp = headerStore.get('cf-connecting-ip')
  if (cfConnectingIp) return cfConnectingIp.trim()

  if (process.env.TRUST_PROXY_HEADERS === 'cloudflare') {
    return 'untrusted-client'
  }

  const forwardedFor = headerStore.get('x-forwarded-for')
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim()
    if (firstIp) return firstIp
  }

  return headerStore.get('x-real-ip') ?? '127.0.0.1'
}

function isProxyTrustedFromEnv(): boolean {
  if (process.env.TRUST_PROXY_HEADERS === 'cloudflare') return true
  if (process.env.TRUST_PROXY_HEADERS === 'true') return true
  if (process.env.TRUST_PROXY_HEADERS === 'false') return false
  if (process.env.VERCEL === '1' || process.env.VERCEL === 'true') return true
  return false
}

/**
 * Applies the public search guard used by `/buscar`.
 *
 * Verified crawlers bypass the per-IP budget so legitimate SEO traffic
 * does not burn the anonymous bucket. Everyone else is capped.
 */
export async function requireCatalogSearchAccess(
  input: CatalogSearchGuardInput,
  deps: CatalogSearchGuardDeps = {},
): Promise<CatalogSearchAccess> {
  const query = input.query.trim()
  if (!query) {
    return {
      allowed: true,
      ip: null,
      verifiedBot: false,
    }
  }

  const headerStore = input.headerStore ?? await getRequestHeaders()
  const ip = extractCatalogSearchIp(headerStore)
  const mergedDeps = {
    checkRateLimit: deps.checkRateLimit ?? defaultCheckRateLimit,
    isVerifiedSearchBot: deps.isVerifiedSearchBot ?? isVerifiedSearchBot,
    trackServer: deps.trackServer ?? defaultTrackServer,
    logger: deps.logger ?? logger,
  }

  const verifiedBot = await mergedDeps.isVerifiedSearchBot(headerStore, ip)
  if (verifiedBot) {
    return {
      allowed: true,
      ip,
      verifiedBot: true,
    }
  }

  const rateLimit = await mergedDeps.checkRateLimit(
    'catalog-search-ip',
    ip ?? 'unknown',
    SEARCH_RATE_LIMIT,
    SEARCH_RATE_WINDOW_SECONDS,
  )

  if (!rateLimit.success) {
    mergedDeps.logger.warn('catalog.ratelimit_blocked', {
      scope: 'search',
      ip,
      categorySlug: input.categorySlug ?? null,
      queryLength: query.length,
      resetAt: rateLimit.resetAt,
      degraded: rateLimit.degraded ?? false,
    })

    await mergedDeps.trackServer(
      'catalog.ratelimit_blocked',
      {
        surface: 'search',
        ip: ip ?? 'unknown',
        category_slug: input.categorySlug ?? null,
        query_length: query.length,
        reset_at: rateLimit.resetAt,
        degraded: rateLimit.degraded ?? false,
      },
      {
        distinctId: ip ?? 'anonymous',
      },
    )

    return {
      allowed: false,
      ip,
      verifiedBot: false,
      resetAt: rateLimit.resetAt,
    }
  }

  return {
    allowed: true,
    ip,
    verifiedBot: false,
  }
}
