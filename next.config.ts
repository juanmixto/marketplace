import type { NextConfig } from 'next'
import { execSync } from 'node:child_process'
import withBundleAnalyzer from '@next/bundle-analyzer'
import { getSecurityHeaders } from '@/lib/security-headers'

type HeaderRule = {
  source: string
  headers: Array<{ key: string; value: string }>
}

// Build identity stamped into client + server bundles. Surfaces via
// process.env.NEXT_PUBLIC_COMMIT_SHA / NEXT_PUBLIC_BUILD_TIME /
// NEXT_PUBLIC_GIT_BRANCH for the floating <BuildBadge /> and the
// <UpdateAvailableBanner /> polling client. Falls back to 'unknown'
// outside a git checkout (Docker COPY-only builds, etc.); override
// with the matching env var to pin a value in CI.
function readGitOutput(cmd: string, fallback: string): string {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback
  } catch {
    return fallback
  }
}
const BUILD_SHA =
  process.env.NEXT_PUBLIC_COMMIT_SHA ?? readGitOutput('git rev-parse --short HEAD', 'unknown')
const BUILD_BRANCH =
  process.env.NEXT_PUBLIC_GIT_BRANCH ?? readGitOutput('git rev-parse --abbrev-ref HEAD', 'unknown')
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? new Date().toISOString()

const NO_STORE_CACHE_HEADER = {
  key: 'Cache-Control',
  value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
}

// Next emits content-hashed filenames under /_next/static (e.g. the
// JS bundle filename includes a build hash). That means a given URL
// never changes meaning — perfect candidate for long-term immutable
// caching. `no-store` here was over-defensive and forced every repeat
// visitor to revalidate on each request.
const STATIC_IMMUTABLE_CACHE_HEADER = {
  key: 'Cache-Control',
  value: 'public, max-age=31536000, immutable',
}

export function buildHeaderRules(isDevelopment = process.env.NODE_ENV === 'development'): HeaderRule[] {
  const rules: HeaderRule[] = [
    {
      source: '/:path*',
      headers: getSecurityHeaders(),
    },
    {
      // The service worker must never be stale — otherwise a CDN or
      // browser cache can pin users to an old SW for hours after a deploy.
      source: '/sw.js',
      headers: [
        NO_STORE_CACHE_HEADER,
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    },
    {
      source: '/manifest.webmanifest',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
    },
  ]

  if (!isDevelopment) {
    rules.unshift(
      {
        source: '/_next/static/:path*',
        headers: [STATIC_IMMUTABLE_CACHE_HEADER],
      },
      {
        // Optimized images — deterministic per source+query, safe to
        // cache for a day at the HTTP layer. The SW layer on top (see
        // public/sw.template.js → mp-images-v1) gives repeat visits a
        // disk-hit instead of a network round trip.
        source: '/_next/image',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
    )
  }

  return rules
}

const nextConfig: NextConfig = {
  // Build identity baked into both server and client bundles. See the
  // helpers above for fallback behaviour outside git checkouts.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: BUILD_SHA,
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
    NEXT_PUBLIC_GIT_BRANCH: BUILD_BRANCH,
  },
  // Allow LAN access to the dev server (e.g. testing on a phone via
  // http://192.168.x.y:3000). Without this, Next.js 16 blocks cross-origin
  // requests to /_next/* dev resources, which breaks HMR AND client hydration
  // (dropdowns, theme toggle, cart, sidebar collapse all stop responding)
  // when the page is loaded from a non-localhost host.
  // `*.feldescloud.com` covers the Cloudflare Tunnel (dev.feldescloud.com →
  // localhost:3001, see docs/runbooks/dev-tunnel.md) and any future subdomain.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '*.local', '*.trycloudflare.com', '*.feldescloud.com'],
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

// Gated by ANALYZE=true so the analyzer plugin is inert in normal builds.
// Usage: `npm run analyze` — emits HTML reports to .next/analyze/*.html.
const withAnalyzer = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })

export default withAnalyzer(nextConfig)
