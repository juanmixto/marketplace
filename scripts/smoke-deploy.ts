#!/usr/bin/env -S npx tsx
/**
 * Post-deploy smoke test.
 *
 * Spawns a headless Chromium against $URL and asserts that the
 * freshly-deployed app actually hydrates and runs client code — not
 * just that `/api/version` returns 200.
 *
 * Catches the 2026-05-04 class of regressions:
 *   - CSP `strict-dynamic` rejects an inline <head> script without
 *     nonce, so React never hydrates. HTML renders, no useEffect runs,
 *     `window.posthog` undefined. /api/version returns 200; everything
 *     interactive is dead. (#1266)
 *   - SW SWR cache serves stale chunks after a deploy with renamed
 *     bundles, so dynamic imports return empty bodies. (#1267)
 *   - Build context dropped a NEXT_PUBLIC_* var, so `posthog.init()`
 *     is a no-op for every visitor. (#1265)
 *
 * Usage (called by scripts/deploy-local-env.sh AFTER /api/version
 * health gate passes):
 *   npx tsx scripts/smoke-deploy.ts <url> [--warn-only]
 *
 * --warn-only: report assertions but always exit 0. Used while a
 * known-broken assertion is being investigated, so the smoke runs and
 * surfaces results without blocking unrelated deploys. Strip the flag
 * once the underlying bug is fixed.
 *
 * Exit codes:
 *   0 — all assertions pass (or --warn-only set)
 *   1 — at least one assertion failed (deploy script should rollback)
 *   2 — wrong arguments / browser launch failed
 */

import { chromium, type Browser } from 'playwright-core'

interface Assertion {
  name: string
  pass: boolean
  detail?: string
}

async function main() {
  const url = process.argv[2]
  const warnOnly = process.argv.includes('--warn-only')
  if (!url || !/^https?:\/\//.test(url)) {
    console.error('Usage: smoke-deploy.ts <url> [--warn-only]')
    process.exit(2)
  }

  const TIMEOUT_MS = 20000
  const results: Assertion[] = []
  const assert = (name: string, pass: boolean, detail?: string) => {
    results.push({ name, pass, detail })
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

  try {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()

    // Track console errors so CSP violations etc. surface even if the
    // assertion itself wouldn't catch them.
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    const failedRequests: string[] = []
    page.on('response', resp => {
      if (resp.status() >= 500) {
        failedRequests.push(`${resp.status()} ${resp.url()}`)
      }
    })

    const homeResp = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT_MS,
    })

    assert(
      'home returns 2xx',
      !!homeResp && homeResp.status() < 300,
      homeResp ? `status ${homeResp.status()}` : 'no response',
    )

    await page
      .waitForFunction(
        () => typeof window !== 'undefined' && !!document.body,
        { timeout: TIMEOUT_MS },
      )
      .catch(() => {})

    const probe = await page.evaluate(() => ({
      hasBody: !!document.body && document.body.children.length > 0,
      posthogType: typeof (window as any).posthog,
      posthogLoaded: (window as any).posthog?.__loaded === true,
      posthogHost: (window as any).posthog?.config?.api_host ?? null,
      nextDataPresent: !!(window as any).__NEXT_DATA__,
    }))

    assert('document body has children', probe.hasBody)
    assert('window.__NEXT_DATA__ present', probe.nextDataPresent)
    assert(
      'window.posthog is loaded',
      probe.posthogLoaded,
      `typeof=${probe.posthogType}, __loaded=${String(probe.posthogLoaded)}, api_host=${probe.posthogHost ?? '<null>'}`,
    )

    const cspViolations = consoleErrors.filter(line =>
      /Content Security Policy|script-src|strict-dynamic/i.test(line),
    )
    assert(
      'no CSP script-src violations in console',
      cspViolations.length === 0,
      cspViolations.length
        ? `${cspViolations.length} violation(s); first: ${cspViolations[0].slice(0, 200)}`
        : '',
    )

    assert(
      'no 5xx network responses during page load',
      failedRequests.length === 0,
      failedRequests.length
        ? `${failedRequests.length} 5xx; first: ${failedRequests[0]}`
        : '',
    )

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

  const failed = results.filter(r => !r.pass)
  console.log('')
  console.log('Smoke test results:')
  for (const r of results) {
    const mark = r.pass ? '✓' : '✗'
    const tail = r.detail ? `  (${r.detail})` : ''
    console.log(`  ${mark} ${r.name}${tail}`)
  }
  console.log('')

  if (failed.length > 0) {
    console.error(`${failed.length} assertion(s) failed.`)
    if (warnOnly) {
      console.error(
        '--warn-only set; exiting 0. Strip this flag from the deploy script once the underlying bug is fixed so future regressions actually block deploys.',
      )
      return
    }
    console.error(
      'Deploy script should treat this as a rollback signal — the new image is serving 200 OK but client-side is broken (CSP, hydration, SW cache, missing NEXT_PUBLIC_*, etc.).',
    )
    process.exit(1)
  }

  console.log('All smoke assertions passed.')
}

main().catch(err => {
  console.error('smoke-deploy: unexpected:', err)
  process.exit(2)
})
