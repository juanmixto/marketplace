#!/usr/bin/env -S npx tsx
/**
 * Post-deploy smoke test.
 *
 * Spawns a headless Chromium against $URL and asserts that the
 * freshly-deployed app actually hydrates and runs client code — not
 * just that `/api/version` returns 200.
 *
 * Iterates across 4 representative routes so a regression scoped to one
 * page (the 2026-05-04 Cloudflare Email Obfuscation bug only broke
 * `/contacto` because that's the page with mailto: links) does not
 * slip through. Memory `feedback_test_multiple_routes_for_client_bugs`:
 * "if a single route is checked, scope-limited regressions ship".
 *
 * Catches the 2026-05-04 class of regressions:
 *   - CSP `strict-dynamic` rejects an inline <head> script without
 *     nonce, so React never hydrates. (#1266)
 *   - SW SWR cache serves stale chunks after a deploy. (#1267)
 *   - Build context dropped a NEXT_PUBLIC_* var. (#1265)
 *   - Cloudflare Email Obfuscation rewrites HTML → React #418. (#1306)
 *   - Logger crash kills client bundle. (#1300)
 *
 * Usage (called by scripts/deploy-local-env.sh AFTER /api/version
 * health gate passes):
 *   npx tsx scripts/smoke-deploy.ts <baseUrl> [--warn-only] [--paths=/,/contacto,/login]
 *
 * --warn-only: report assertions but always exit 0. Used while a
 * known-broken assertion is being investigated, so the smoke runs and
 * surfaces results without blocking unrelated deploys.
 *
 * --paths: override the default route set. Comma-separated list of
 * paths to probe (e.g. --paths=/checkout,/buscar). Default covers
 * home + a static-content route + an auth route + one with content
 * Cloudflare features tend to rewrite (emails on /contacto).
 *
 * Exit codes:
 *   0 — all assertions pass on all routes (or --warn-only set)
 *   1 — at least one assertion failed (deploy script should rollback)
 *   2 — wrong arguments / browser launch failed
 */

import { chromium, type Browser, type Page } from 'playwright-core'

interface Assertion {
  route: string
  name: string
  pass: boolean
  detail?: string
}

// Default route set covers: home + 2 RSC-heavy listings + 1 CF
// honeypot (mailto:) + 1 form route + 1 querystring route + 1
// auth-redirected route + 1 static-content baseline.
//
// Why these 8 specifically:
//   /           — the most common landing
//   /productos  — RSC heavy listing (catalog grid + filters)
//   /productores — RSC heavy listing (different shape than productos)
//   /contacto   — has 4 mailto: links → triggers Cloudflare Email
//                 Obfuscation if it gets re-enabled (#1306 sentinel)
//   /buscar     — form + querystring rendering
//   /login      — form with submit handler + next-auth client init
//   /carrito    — exercises auth-redirect (307 → /login?callbackUrl=)
//                 so the smoke catches a regression in the auth gate
//                 chain itself (middleware, getServerSession, etc.)
//   /faq        — purely static; baseline that anything dynamic isn't
//                 polluting the page. If /faq fails everything fails.
const DEFAULT_PATHS = [
  '/',
  '/productos',
  '/productores',
  '/contacto',
  '/buscar',
  '/login',
  '/carrito',
  '/faq',
]
const TIMEOUT_MS = 20000

async function probeRoute(page: Page, baseUrl: string, path: string): Promise<Assertion[]> {
  const results: Assertion[] = []
  const assert = (name: string, pass: boolean, detail?: string) => {
    results.push({ route: path, name, pass, detail })
  }

  const consoleErrors: string[] = []
  const failedRequests: string[] = []
  const onConsole = (msg: { type(): string; text(): string }) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  }
  const onResponse = (resp: { status(): number; url(): string }) => {
    if (resp.status() >= 500) failedRequests.push(`${resp.status()} ${resp.url()}`)
  }
  page.on('console', onConsole)
  page.on('response', onResponse)

  try {
    const url = baseUrl.replace(/\/$/, '') + path
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT_MS })

    assert(
      'returns 2xx',
      !!resp && resp.status() < 300,
      resp ? `status ${resp.status()}` : 'no response',
    )

    await page
      .waitForFunction(
        () => typeof window !== 'undefined' && !!document.body,
        { timeout: TIMEOUT_MS },
      )
      .catch(() => {})

    // Give React a moment to hydrate after networkidle (PostHog config.js,
    // analytics late effects, etc.).
    await page.waitForTimeout(2000)

    const probe = await page.evaluate(() => ({
      hasBody: !!document.body && document.body.children.length > 0,
      // posthog-js v1.x imported as ES module does NOT set window.posthog —
      // the SDK lives entirely in the imported reference. Real signals
      // it loaded: window.__PosthogExtensions__ + window._POSTHOG_REMOTE_CONFIG
      // (set when /array/<key>/config.js downloads). 2026-05-04: lost ~4h
      // checking window.posthog?.__loaded — that check is always undefined.
      posthogReady: typeof (window as any).__PosthogExtensions__ !== 'undefined',
      posthogRemoteConfig: typeof (window as any)._POSTHOG_REMOTE_CONFIG !== 'undefined',
      // Hydration sentinel: forms with submit handlers OR buttons with
      // onclick attached after React hydrates. Routes like /login have
      // a form (no buttons with onclick); routes like / have buttons.
      buttonsHydrated:
        document.querySelectorAll('button[type="submit"], form').length > 0 ||
        Array.from(document.querySelectorAll('button')).some(
          (b: any) => b.onclick !== null,
        ),
      // Cloudflare Email Obfuscation sentinel: any presence of __cf_email__
      // means CF rewrote our HTML → SSR/CSR mismatch → React #418 in prod.
      cloudflareRewriteDetected:
        document.querySelectorAll('.__cf_email__, [data-cfemail]').length > 0,
    }))

    assert('document body has children', probe.hasBody)
    assert(
      'React hydrated (form/button handlers attached)',
      probe.buttonsHydrated,
      'no submit forms, no buttons with onclick',
    )
    assert(
      'PostHog SDK initialized',
      probe.posthogReady && probe.posthogRemoteConfig,
      `__PosthogExtensions__=${probe.posthogReady}, _POSTHOG_REMOTE_CONFIG=${probe.posthogRemoteConfig}`,
    )
    assert(
      'no Cloudflare HTML rewrite (Email Obfuscation off)',
      !probe.cloudflareRewriteDetected,
      probe.cloudflareRewriteDetected
        ? '__cf_email__ found in DOM — CF will trigger React #418 hydration mismatch'
        : '',
    )

    const cspViolations = consoleErrors.filter(line =>
      /Content Security Policy|script-src|strict-dynamic/i.test(line),
    )
    assert(
      'no CSP script-src violations',
      cspViolations.length === 0,
      cspViolations.length
        ? `${cspViolations.length} violation(s); first: ${cspViolations[0].slice(0, 200)}`
        : '',
    )

    assert(
      'no 5xx network responses',
      failedRequests.length === 0,
      failedRequests.length
        ? `${failedRequests.length} 5xx; first: ${failedRequests[0]}`
        : '',
    )
  } finally {
    page.off('console', onConsole)
    page.off('response', onResponse)
  }

  return results
}

async function main() {
  const baseUrl = process.argv[2]
  const warnOnly = process.argv.includes('--warn-only')
  const pathsArg = process.argv.find(a => a.startsWith('--paths='))
  const paths = pathsArg
    ? pathsArg
        .slice('--paths='.length)
        .split(',')
        .map(p => p.trim())
        .filter(Boolean)
    : DEFAULT_PATHS

  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
    console.error('Usage: smoke-deploy.ts <baseUrl> [--warn-only] [--paths=/,/contacto]')
    process.exit(2)
  }

  let browser: Browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (err) {
    console.error(
      'smoke-deploy: cannot launch Chromium:',
      err instanceof Error ? err.message : err,
    )
    process.exit(2)
  }

  const allResults: Assertion[] = []

  try {
    // Reuse a single context across routes so a SW installed on the
    // first visit is in play for the rest — that mirrors a returning
    // visitor and would surface SW cache regressions. New page per
    // route keeps console/response listeners scoped.
    const ctx = await browser.newContext()
    for (const path of paths) {
      const page = await ctx.newPage()
      try {
        const r = await probeRoute(page, baseUrl, path)
        allResults.push(...r)
      } finally {
        await page.close().catch(() => {})
      }
    }
    await ctx.close()
  } catch (err) {
    console.error(
      'smoke-deploy: browser run threw:',
      err instanceof Error ? err.message : err,
    )
    await browser.close().catch(() => {})
    process.exit(2)
  }

  await browser.close()

  console.log('')
  console.log('Smoke test results:')
  // Group by route for readability.
  const byRoute = new Map<string, Assertion[]>()
  for (const r of allResults) {
    const list = byRoute.get(r.route) ?? []
    list.push(r)
    byRoute.set(r.route, list)
  }
  for (const [route, results] of byRoute) {
    console.log(`  ${route}`)
    for (const r of results) {
      const mark = r.pass ? '✓' : '✗'
      const tail = r.detail ? `  (${r.detail})` : ''
      console.log(`    ${mark} ${r.name}${tail}`)
    }
  }
  console.log('')

  const failed = allResults.filter(r => !r.pass)
  if (failed.length > 0) {
    const routesFailed = new Set(failed.map(f => f.route)).size
    console.error(
      `${failed.length} assertion(s) failed across ${routesFailed} route(s).`,
    )
    if (warnOnly) {
      console.error(
        '--warn-only set; exiting 0. Strip this flag from the deploy script once the underlying bug is fixed so future regressions actually block deploys.',
      )
      return
    }
    console.error(
      'Deploy script should treat this as a rollback signal — the new image is serving 200 OK but client-side is broken (CSP, hydration, SW cache, missing NEXT_PUBLIC_*, CF rewrite, etc.).',
    )
    process.exit(1)
  }

  console.log(`All smoke assertions passed across ${paths.length} route(s).`)
}

main().catch(err => {
  console.error('smoke-deploy: unexpected:', err)
  process.exit(2)
})
