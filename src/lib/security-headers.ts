export interface SecurityHeader {
  key: string
  value: string
}

export function buildContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Stripe Elements injects inline scripts/styles as part of its hosted integration.
    "script-src 'self' 'unsafe-inline' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    'font-src \'self\' data:',
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "connect-src 'self' https://api.stripe.com https://js.stripe.com",
    "object-src 'none'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
  ].join('; ')
}

export function getSecurityHeaders(): SecurityHeader[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-XSS-Protection', value: '1; mode=block' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    {
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    },
    {
      key: 'Content-Security-Policy',
      value: buildContentSecurityPolicy(),
    },
  ]
}
