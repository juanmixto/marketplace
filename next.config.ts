import type { NextConfig } from 'next'
import { getSecurityHeaders } from '@/lib/security-headers'

type HeaderRule = {
  source: string
  headers: Array<{ key: string; value: string }>
}

const NO_STORE_CACHE_HEADER = {
  key: 'Cache-Control',
  value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
}

export function buildHeaderRules(isDevelopment = process.env.NODE_ENV === 'development'): HeaderRule[] {
  const rules: HeaderRule[] = [
    {
      source: '/:path*',
      headers: getSecurityHeaders(),
    },
  ]

  if (!isDevelopment) {
    rules.unshift(
      {
        source: '/_next/static/:path*',
        headers: [NO_STORE_CACHE_HEADER],
      },
      {
        source: '/_next/image',
        headers: [NO_STORE_CACHE_HEADER],
      },
    )
  }

  return rules
}

const nextConfig: NextConfig = {
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'inline',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '**.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: '**.uploadthing.com',
      },
    ],
  },
  async headers() {
    return buildHeaderRules()
  },
}

export default nextConfig
