/**
 * Image validation and sanitization utilities
 * Ensures images come from trusted sources and are properly formatted
 */

// Allowed image domains for Next.js Image optimization
const ALLOWED_DOMAINS = [
  'images.unsplash.com',
  'cloudinary.com',
  'uploadthing.com',
  // Vercel Blob storage — used by the upload API when BLOB_READ_WRITE_TOKEN
  // is set (see src/lib/blob-storage.ts).
  'public.blob.vercel-storage.com',
]

/**
 * Returns true for URLs the upload API itself produces in local-mode dev:
 * relative paths under `/uploads/`. They are served by Next.js out of
 * `public/` so we don't need a hostname allowlist for them.
 */
export function isLocalUploadPath(url: string): boolean {
  return url.startsWith('/uploads/')
}

/**
 * Checks if a domain is in the allowed list
 * Supports wildcards (e.g., **.cloudinary.com matches any subdomain)
 */
export function isAllowedDomain(hostname: string): boolean {
  return ALLOWED_DOMAINS.some(allowed => {
    if (allowed.startsWith('**.')) {
      const baseDomain = allowed.replace('**.', '')
      return hostname.endsWith(baseDomain)
    }
    return hostname === allowed
  })
}

/**
 * Validates if a string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Validates if a URL is safe for display.
 * Accepts:
 *  - relative paths produced by the local upload backend (`/uploads/...`)
 *  - HTTPS URLs whose hostname is in the allow list
 */
export function isAllowedImageUrl(url: string): boolean {
  if (isLocalUploadPath(url)) {
    return true
  }
  try {
    const parsed = new URL(url)

    // Require HTTPS for security
    if (parsed.protocol !== 'https:') {
      return false
    }

    // Check against allowed domains
    return isAllowedDomain(parsed.hostname)
  } catch {
    return false
  }
}

/**
 * Parses and validates image URLs from text input
 * Returns only valid URLs from allowed domains
 */
export function parseAndValidateImages(text?: string): {
  valid: string[]
  invalid: string[]
} {
  if (!text) {
    return { valid: [], invalid: [] }
  }

  const urls = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  const result = {
    valid: [] as string[],
    invalid: [] as string[],
  }

  for (const url of urls) {
    if (isAllowedImageUrl(url)) {
      // Avoid duplicates
      if (!result.valid.includes(url)) {
        result.valid.push(url)
      }
    } else {
      result.invalid.push(url)
    }
  }

  return result
}

/**
 * Get detailed error message for invalid URLs
 */
export function getImageValidationError(url: string): string {
  if (!url) return 'URL vacía'

  if (!isValidUrl(url)) {
    return 'URL inválida'
  }

  try {
    const parsed = new URL(url)

    if (parsed.protocol !== 'https:') {
      return 'Solo se permiten URLs HTTPS'
    }

    if (!isAllowedDomain(parsed.hostname)) {
      return `Dominio no permitido: ${parsed.hostname}. Usa URLs de uploadthing.com, cloudinary.com o unsplash.com`
    }
  } catch {
    return 'URL inválida'
  }

  return 'URL no permitida'
}
