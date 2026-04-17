export interface SecurityHeader {
  key: string
  value: string
}

function shouldEnforceHttpsHeaders() {
  const candidateUrls = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
  ].filter((value): value is string => Boolean(value))

  return candidateUrls.some(value => {
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  })
}

export function buildContentSecurityPolicy(
  isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
) {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Stripe Elements injects inline scripts/styles as part of its hosted integration.
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''} https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    'font-src \'self\' data:',
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    `connect-src 'self'${isDevelopment ? ' ws: wss:' : ''} https://api.stripe.com https://js.stripe.com`,
    "object-src 'none'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
  ]

  if (shouldEnforceHttpsHeaders()) {
    directives.push('upgrade-insecure-requests')
  }

  return directives.join('; ')
}

export function getSecurityHeaders(): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-XSS-Protection', value: '1; mode=block' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    {
      key: 'Content-Security-Policy',
      value: buildContentSecurityPolicy(),
    },
  ]

  if (shouldEnforceHttpsHeaders()) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    })
  }

  return headers
}
