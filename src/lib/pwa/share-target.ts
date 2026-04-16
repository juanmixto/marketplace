import { SITE_URL } from '@/lib/seo'

export interface ShareTargetParams {
  title?: string | null
  text?: string | null
  url?: string | null
}

export type ShareTargetResolution =
  | { type: 'product'; redirect: string }
  | { type: 'vendor'; redirect: string }
  | { type: 'search'; redirect: string }
  | { type: 'home'; redirect: string }

/**
 * Given the raw params from a Web Share Target invocation, figure out
 * where in the app to redirect the user.
 *
 * Priority:
 * 1. If `url` or `text` contains a recognizable product path → product page
 * 2. If it contains a vendor path → vendor profile
 * 3. If there's any non-empty text → search
 * 4. Fallback → home
 */
export function resolveShareTarget(params: ShareTargetParams): ShareTargetResolution {
  const raw = [params.url, params.text, params.title].filter(Boolean).join(' ')

  // Try to extract a path from our own domain URL.
  const ownPath = extractOwnPath(raw)
  if (ownPath) {
    const productMatch = ownPath.match(/^\/productos\/([\w-]+)/)
    if (productMatch) {
      return { type: 'product', redirect: `/productos/${productMatch[1]}?source=share-target` }
    }
    const vendorMatch = ownPath.match(/^\/productores\/([\w-]+)/)
    if (vendorMatch) {
      return { type: 'vendor', redirect: `/productores/${vendorMatch[1]}?source=share-target` }
    }
  }

  // Fallback: use any meaningful text as a search query.
  const query = extractSearchQuery(params)
  if (query) {
    return { type: 'search', redirect: `/buscar?q=${encodeURIComponent(query)}&source=share-target` }
  }

  return { type: 'home', redirect: '/?source=share-target' }
}

/**
 * If the raw content contains a URL from our own domain, return just the
 * pathname portion (e.g. "/productos/tomate-eco"). Returns null otherwise.
 */
function extractOwnPath(raw: string): string | null {
  // Match URLs that look like our domain.
  const siteOrigin = new URL(SITE_URL).origin
  const urlRegex = /https?:\/\/[^\s]+/gi
  const urls = raw.match(urlRegex)
  if (!urls) return null

  for (const candidate of urls) {
    try {
      const parsed = new URL(candidate)
      if (parsed.origin === siteOrigin) {
        return parsed.pathname
      }
    } catch {
      // not a valid URL — skip
    }
  }
  return null
}

/**
 * Build a sensible search query from the share params. Strips URLs and
 * excessive whitespace so the search page gets clean input.
 */
function extractSearchQuery(params: ShareTargetParams): string | null {
  // Prefer `text`, then `title`. Skip `url` — it's already handled above.
  const raw = (params.text ?? params.title ?? '').trim()
  if (!raw) return null

  // Strip any URLs so the search page doesn't try to search "https://..."
  const cleaned = raw.replace(/https?:\/\/\S+/gi, '').trim()
  if (!cleaned) return null

  // Cap at 100 chars to avoid abuse.
  return cleaned.length > 100 ? cleaned.slice(0, 100) : cleaned
}
