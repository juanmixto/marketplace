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
  // Allow LAN access to the dev server (e.g. testing on a phone via
  // http://192.168.x.y:3000). Without this, Next.js 16 blocks cross-origin
  // requests to /_next/* dev resources, which breaks HMR and the dev overlay
  // when the page is loaded from a non-localhost host.
  // The pattern matches any host on a typical home/office private network.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '*.local'],
  experimental: {
    staleTimes: {
      // Default is 300 s (matches revalidate = 300). That causes Link-navigation to serve
      // a stale prefetched RSC payload for up to 5 minutes even after server-side data changes.
      // 30 s is the minimum Next.js allows and gives a good freshness/performance balance.
      static: 30,
    },
  },
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
      {
        // Vercel Blob storage — used by the upload API when
        // BLOB_READ_WRITE_TOKEN is set (#31).
        protocol: 'https',
        hostname: '**.public.blob.vercel-storage.com',
      },
    ],
  },
  async headers() {
    return buildHeaderRules()
  },
}

export default nextConfig
