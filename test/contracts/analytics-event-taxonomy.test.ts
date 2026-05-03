/**
 * Contract: PostHog event taxonomy stays consistent across the type
 * union, the docs, and every call site.
 *
 * Three rules, each its own subtest:
 *
 *   1. Every name in `AnalyticsEventName` is documented in
 *      `docs/posthog-dashboards.md` under the "Event reference"
 *      heading. A typed event with no doc is invisible to whoever
 *      sets up the dashboard — the previous gap is exactly why the
 *      #1091 favorites bug went undetected (no `result` recorded =>
 *      no failure-rate dashboard => no alert).
 *
 *   2. Every event listed in `BUYER_MUTATION_EVENTS` is fired with a
 *      `result:` property at every call site. Without this, the
 *      Buyer Mutations Health dashboard cannot compute failure rate
 *      and we lose the safety net that this whole work is for.
 *
 *   3. Every event documented in posthog-dashboards.md exists in
 *      `AnalyticsEventName`. Drift guard: a renamed event with a
 *      stale doc entry silently breaks dashboards.
 *
 * The test reads source files directly (no build step) so it stays
 * fast and runs in the lightweight `npm test` shard. Heuristics are
 * deliberately conservative — false negatives are better than false
 * positives blocking unrelated PRs.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

function extractTypeUnion(source: string, typeName: string): string[] {
  // Match `export type <typeName> =` followed by `| 'foo'` lines until
  // a blank line / next non-pipe token.
  const startRe = new RegExp(`export type ${typeName}\\s*=\\s*([\\s\\S]*?)\\n\\n`, 'm')
  const m = source.match(startRe)
  if (!m) throw new Error(`Could not find type ${typeName} in source`)
  const body = m[1]
  const out: string[] = []
  for (const line of body.split('\n')) {
    const lit = line.match(/^\s*\|?\s*'([^']+)'/)
    if (lit) out.push(lit[1])
  }
  return out
}

function extractReadonlyArray(source: string, constName: string): string[] {
  const re = new RegExp(
    `export const ${constName}\\s*:\\s*readonly\\s+\\w+\\[\\]\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`,
    'm'
  )
  const m = source.match(re)
  if (!m) throw new Error(`Could not find const ${constName} in source`)
  const body = m[1]
  return Array.from(body.matchAll(/'([^']+)'/g)).map(x => x[1])
}

function extractDocumentedEvents(doc: string): Set<string> {
  // Doc events live in markdown table rows like: `| \`event_name\` | ... |`.
  // We only count names found inside backticks in the leftmost cell of
  // a row whose first column is a backticked identifier (so we don't
  // sweep up free-form mentions in prose). The `.` is part of the
  // CF-1 buyer-funnel naming contract (`catalog.viewed`,
  // `order.placed`, …) — it's a legal character in PostHog event
  // names and must be allowed here.
  //
  // Dashboard 7 (Notification Health) is filtered out: its tables list
  // structured-logger scopes (`notifications.handler.skipped`,
  // `email.send.skipped`, …) that flow to Sentry, not PostHog. Those
  // are not `trackAnalyticsEvent` / `capturePostHog` call-sites and
  // do NOT belong in `AnalyticsEventName`. The dashboard's purpose is
  // to monitor fail-open subsystems via logger output (eventually
  // shipped to PostHog separately or read from Sentry); the contract
  // for AnalyticsEventName is unrelated.
  const dashboardSevenStart = doc.indexOf('## Dashboard 7')
  const dashboardSevenEnd = dashboardSevenStart === -1
    ? -1
    : doc.indexOf('\n## ', dashboardSevenStart + 1)
  const filteredDoc = dashboardSevenStart === -1
    ? doc
    : doc.slice(0, dashboardSevenStart) +
      (dashboardSevenEnd === -1 ? '' : doc.slice(dashboardSevenEnd))

  const rows = filteredDoc.split('\n').filter(line => line.trimStart().startsWith('|'))
  const events = new Set<string>()
  for (const row of rows) {
    const firstCell = row.split('|')[1]?.trim() ?? ''
    const m = firstCell.match(/^`([a-z_.$]+)`$/)
    if (m) events.add(m[1])
  }
  return events
}

function listFiringSites(eventName: string): Array<{ file: string; lineRange: string; block: string }> {
  // Find every `trackAnalyticsEvent('<eventName>'` or
  // `capturePostHog('<eventName>'` call across the source tree, and
  // capture a window from the call to its closing brace so the
  // contract test can grep `result:` inside that window.
  const out: Array<{ file: string; lineRange: string; block: string }> = []
  // `--untracked` so a brand-new tracker file (not yet committed)
  // counts as a fire-site. Otherwise the contract test would force a
  // staging-then-running workflow and fail on the first iteration of
  // any new event wiring. `--no-index` would also work but disables
  // the .gitignore filter, which we want.
  let grep = ''
  try {
    grep = execSync(
      `git grep -n --untracked -E "(trackAnalyticsEvent|capturePostHog)\\\\(\\s*['\\"]${eventName}['\\"]" -- 'src/**/*.ts' 'src/**/*.tsx'`,
      { encoding: 'utf8' }
    ).trim()
  } catch {
    // git grep exits 1 when no matches: that's the "no fire-site"
    // signal the caller already handles via the empty-string branch.
    grep = ''
  }

  if (!grep) return out

  for (const hit of grep.split('\n')) {
    // Format: `path:line:source-snippet`
    const [path, lineStr] = hit.split(':', 2)
    const startLine = Number(lineStr)
    const source = read(path)
    const lines = source.split('\n')
    // Walk forward counting parentheses until the call's outermost (
    // closes. Skips parens inside string literals (single, double, and
    // template) so e.g. `createAnalyticsItem({ ... })` does not
    // confuse the matcher.
    const window = lines.slice(startLine - 1, startLine + 24).join('\n')
    const callIdx = window.search(/(trackAnalyticsEvent|capturePostHog)\s*\(/)
    if (callIdx < 0) continue
    const openParenIdx = window.indexOf('(', callIdx)
    let depth = 0
    let closeIdx = -1
    let inSingle = false
    let inDouble = false
    let inTemplate = false
    let prev = ''
    for (let i = openParenIdx; i < window.length; i++) {
      const ch = window[i]
      if (!inSingle && !inDouble && !inTemplate) {
        if (ch === "'") inSingle = true
        else if (ch === '"') inDouble = true
        else if (ch === '`') inTemplate = true
        else if (ch === '(') depth++
        else if (ch === ')') {
          depth--
          if (depth === 0) {
            closeIdx = i
            break
          }
        }
      } else if (inSingle && ch === "'" && prev !== '\\') inSingle = false
      else if (inDouble && ch === '"' && prev !== '\\') inDouble = false
      else if (inTemplate && ch === '`' && prev !== '\\') inTemplate = false
      prev = ch
    }
    const block = closeIdx > openParenIdx
      ? window.slice(callIdx, closeIdx + 1)
      : window.slice(callIdx)
    out.push({
      file: path,
      lineRange: `${startLine}-${startLine + block.split('\n').length - 1}`,
      block,
    })
  }
  return out
}

describe('PostHog event taxonomy contract', () => {
  test('every AnalyticsEventName is documented in posthog-dashboards.md', () => {
    const analyticsSource = read('src/lib/analytics.ts')
    const typed = new Set(extractTypeUnion(analyticsSource, 'AnalyticsEventName'))
    const documented = extractDocumentedEvents(read('docs/posthog-dashboards.md'))

    // page_view is captured by the framework, no doc row needed.
    typed.delete('page_view')
    // pwa_* events have their own document, see docs/pwa.md. Excluding
    // them here keeps this test focused on dashboards.md without
    // duplicating the source-of-truth list across two docs.
    for (const name of Array.from(typed)) {
      if (name.startsWith('pwa_')) typed.delete(name)
    }
    // contact_submit also lives in a separate funnel doc (TODO: add).
    typed.delete('contact_submit')

    const undocumented = Array.from(typed).filter(name => !documented.has(name))
    assert.deepEqual(
      undocumented,
      [],
      `These typed events are missing from docs/posthog-dashboards.md "Event reference" table:\n  - ${undocumented.join(
        '\n  - '
      )}\n\nAdd a row with the property shape so dashboards stay synced with the type.`
    )
  })

  test('every documented event exists in AnalyticsEventName', () => {
    const analyticsSource = read('src/lib/analytics.ts')
    const typed = new Set(extractTypeUnion(analyticsSource, 'AnalyticsEventName'))
    const documented = extractDocumentedEvents(read('docs/posthog-dashboards.md'))

    // Framework-auto events live in docs but not in our union.
    documented.delete('$pageview')
    documented.delete('$web_vitals')
    documented.delete('$long_task')

    const orphaned = Array.from(documented).filter(name => !typed.has(name))
    assert.deepEqual(
      orphaned,
      [],
      `These documented events have no entry in AnalyticsEventName:\n  - ${orphaned.join(
        '\n  - '
      )}\n\nEither add to the union or drop the doc row — drift will silently break dashboards.`
    )
  })

  test('every BUYER_FUNNEL_EVENTS event is wired and emits `device` + `referrer`', () => {
    const analyticsSource = read('src/lib/analytics.ts')
    const funnelEvents = extractReadonlyArray(analyticsSource, 'BUYER_FUNNEL_EVENTS')

    const violations: string[] = []
    for (const eventName of funnelEvents) {
      const sites = listFiringSites(eventName)
      if (sites.length === 0) {
        violations.push(
          `${eventName}: declared in BUYER_FUNNEL_EVENTS but no fire-site found (the CF-1 funnel insight would have a hole at this step).`
        )
        continue
      }
      for (const site of sites) {
        // Both events must carry device + referrer so funnel
        // breakdowns by device/source remain consistent. The check is
        // deliberately textual: a property named `device` (object key
        // or shorthand) and a property named `referrer` somewhere in
        // the call-window source. Conservative — false negatives are
        // fine, false positives block unrelated PRs.
        if (!/\bdevice\s*[:,}]/.test(site.block)) {
          violations.push(
            `${eventName} fired at ${site.file}:${site.lineRange} without a 'device' property.\n${site.block}\n  → use getBuyerFunnelContext() so device breakdowns work.`
          )
        }
        if (!/\breferrer\s*[:,}]/.test(site.block)) {
          violations.push(
            `${eventName} fired at ${site.file}:${site.lineRange} without a 'referrer' property.\n${site.block}\n  → use getBuyerFunnelContext() so source attribution works.`
          )
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Buyer-funnel events must always carry device + referrer (CF-1 funnel contract). Violations:\n\n${violations.join('\n\n')}`
    )
  })

  test('every BUYER_MUTATION_EVENTS call site passes a `result` property', () => {
    const analyticsSource = read('src/lib/analytics.ts')
    const buyerEvents = extractReadonlyArray(analyticsSource, 'BUYER_MUTATION_EVENTS')

    const violations: string[] = []
    for (const eventName of buyerEvents) {
      const sites = listFiringSites(eventName)
      if (sites.length === 0) {
        violations.push(
          `${eventName}: declared in BUYER_MUTATION_EVENTS but no fire-site found (dead code or refactored away?)`
        )
        continue
      }
      for (const site of sites) {
        // Accept both `result: 'success'` (explicit) and `result,`
        // (shorthand for a local of the same name). Also accept
        // `result: variable` (no quotes).
        const hasExplicit = /\bresult\s*:/.test(site.block)
        const hasShorthand = /\bresult\s*[,}]/.test(site.block)
        if (!hasExplicit && !hasShorthand) {
          violations.push(
            `${eventName} fired at ${site.file}:${site.lineRange} without a 'result' property:\n${site.block}\n  → add result: 'success' | 'failure' so the Buyer Mutations Health dashboard can count failures.`
          )
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Buyer-mutation events must always carry a result property. Violations:\n\n${violations.join('\n\n')}`
    )
  })
})
