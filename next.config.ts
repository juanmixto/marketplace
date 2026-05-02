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

// Tunnel hostnames allowed for cross-origin /_next/* requests in dev. Sourced
// from DEV_TUNNEL_HOSTS so coexistence (raizdirecta.es + feldescloud.com) and
// the eventual cleanup happen via env, not a code change. Default mirrors the
// coexistence window of docs/runbooks/domain-migration.md.
const devTunnelHosts = (process.env.DEV_TUNNEL_HOSTS ?? '*.raizdirecta.es,*.feldescloud.com')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

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

  if (isDevelopment) {
    // In dev, every chunk recompiles on save — caching it for hours just
    // serves yesterday's bundle to phones that hit /_next/static/* before
    // the watcher picked up the change. Force every dev request to be a
    // network revalidation. Next's own default for dev is `max-age=14400`,
    // which is the wrong default when the underlying file changes minute
    // to minute.
    rules.unshift({
      source: '/_next/static/:path*',
      headers: [NO_STORE_CACHE_HEADER],
    })
  } else {
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
  // Tunnel hostnames come from DEV_TUNNEL_HOSTS (see top of file) so the
  // allow-list tracks the domain migration without a code change.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '*.local', '*.trycloudflare.com', ...devTunnelHosts],
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
    // Tuned to the actual catalog (#1051). Defaults bake breakpoints up to
    // 3840px and only emit WebP — both wrong for our surface:
    //   - No `<Image sizes>` in the repo declares a breakpoint above 1280px
    //     (max declared is `(max-width: 1280px) 100vw, 1280px` on the
    //     producer detail hero), so 1920/2048/3840 just spawn variants
    //     nobody requests and waste cache space.
    //   - AVIF saves ~20 % over WebP in supporting browsers (Chrome /
    //     Firefox / Safari 16+); listing it first lets Next negotiate via
    //     Accept-headers automatically. WebP stays as fallback.
    //   - imageSizes trimmed to the thumbnail widths in actual use
    //     (28/40/48/56/64/80/200 px round up cleanly into 32/64/96/128/256).
    // The 1600 ceiling leaves headroom for a single 2× retina pass on a
    // 1280-CSS-px hero without overshooting. An audit script
    // (scripts/audit-image-sizes.mjs) checks net-new `sizes` props don't
    // declare a breakpoint above this.
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 640, 750, 828, 1080, 1280, 1600],
    imageSizes: [16, 32, 64, 96, 128, 256],
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
      {
        // Google account avatars (User.image when signed in via Google).
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
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
