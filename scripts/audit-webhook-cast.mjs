#!/usr/bin/env node
/**
 * audit-webhook-cast.mjs
 *
 * Hardens HU1 of #1160. The signature on a webhook proves the body
 * came from the provider; it does NOT prove the body has the shape
 * the dispatcher reads. A `JSON.parse(body) as <Type>` cast trades
 * runtime safety for compile-time convenience: the moment the
 * provider ships a payload v2 / a feature flag flips a partial
 * shape / a test mocks the wrong fixture, the dispatcher crashes
 * on a `TypeError` that doesn't get classified as "invalid_payload".
 *
 * The marketplace webhook handlers (Sendcloud, Stripe) all use
 * `<schema>.safeParse(JSON.parse(body))` today (see
 * `src/app/api/webhooks/sendcloud/route.ts:89` and
 * `src/app/api/webhooks/stripe/route.ts:142`). This script freezes
 * that contract: any future regression where the cast comes back
 * fails CI.
 *
 * What this audits:
 *
 *   Every file under `src/app/api/webhooks/` flagged if it contains
 *   `JSON.parse(...) as ...` on the same line OR inside the same
 *   call expression. The heuristic is intentionally narrow — we only
 *   care about the cast-after-parse antipattern, not generic `as`
 *   casts elsewhere in the route.
 *
 * Ratchet mode: same as the other audits. Baseline is expected to be
 * empty on green main; the script exists so a regression can't slip
 * past review.
 *
 * Usage:
 *   node scripts/audit-webhook-cast.mjs                     # CI mode
 *   node scripts/audit-webhook-cast.mjs --json
 *   node scripts/audit-webhook-cast.mjs --soft
 *   node scripts/audit-webhook-cast.mjs --all
 *   node scripts/audit-webhook-cast.mjs --update-baseline
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src', 'app', 'api', 'webhooks')
const BASELINE = join(ROOT, 'scripts', 'audit-webhook-cast.baseline.json')
const SOFT = process.argv.includes('--soft')
const JSON_OUT = process.argv.includes('--json')
const ALL = process.argv.includes('--all')
const UPDATE_BASELINE = process.argv.includes('--update-baseline')

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (entry.endsWith('.ts')) out.push(p)
  }
  return out
}

const violations = []

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file)
  const src = readFileSync(file, 'utf8')
  if (!src.includes('JSON.parse')) continue

  let i = 0
  while (true) {
    const idx = src.indexOf('JSON.parse', i)
    if (idx === -1) break
    i = idx + 'JSON.parse'.length

    // Slurp the call expression. Match parens to find the close of
    // `JSON.parse(...)`, then look ahead for ` as ` before the
    // statement / expression boundary (`,`, `;`, `\n`, `)`, `}`).
    let j = i
    let depth = 0
    while (j < src.length) {
      const ch = src[j]
      if (ch === '(') depth++
      else if (ch === ')') {
        depth--
        if (depth === 0) { j++; break }
      }
      j++
    }
    // Look ahead for ` as Identifier`. Stop at the first delimiter so
    // we don't catch `as` from a later expression on the same line.
    let k = j
    let lookahead = ''
    while (k < src.length) {
      const ch = src[k]
      if (ch === ',' || ch === ';' || ch === '\n' || ch === ')' || ch === '}') break
      lookahead += ch
      k++
    }
    if (!/\bas\s+(?!const\b)\w/.test(lookahead)) continue

    const lineNo = src.slice(0, idx).split('\n').length
    const lineEnd = src.indexOf('\n', idx)
    const lineSlice = src.slice(idx, lineEnd === -1 ? src.length : lineEnd)
    violations.push({
      file: rel,
      line: lineNo,
      excerpt: lineSlice.trim().slice(0, 160),
    })
  }
}

function violationKey(v) {
  return `${v.file}|${v.excerpt}`
}

function loadBaseline() {
  if (!existsSync(BASELINE)) return new Set()
  try {
    return new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).violations || [])
  } catch {
    return new Set()
  }
}

const baseline = loadBaseline()
const currentKeys = new Set(violations.map(violationKey))
const netNew = violations.filter((v) => !baseline.has(violationKey(v)))
const cleanedUp = [...baseline].filter((k) => !currentKeys.has(k))

if (UPDATE_BASELINE) {
  writeFileSync(BASELINE, JSON.stringify({
    note:
      'JSON.parse(...) as <Type> casts in webhook handlers. Should be empty on green main; ' +
      'the file exists so a regression can be ratcheted, never silently accepted.',
    generatedAt: new Date().toISOString(),
    violations: [...currentKeys].sort(),
  }, null, 2) + '\n')
  process.stdout.write(`audit-webhook-cast: baseline updated — ${currentKeys.size} entries\n`)
  process.exit(0)
}

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({
    violations: ALL ? violations : netNew,
    netNewCount: netNew.length,
    baselineSize: baseline.size,
    cleanedUpCount: cleanedUp.length,
  }, null, 2) + '\n')
} else {
  for (const v of (ALL ? violations : netNew)) {
    process.stdout.write(`\n[webhook-cast] ${v.file}:${v.line}\n`)
    process.stdout.write(`  > ${v.excerpt}\n`)
  }
  if (netNew.length === 0 && cleanedUp.length === 0) {
    process.stdout.write(`\naudit-webhook-cast: clean (baseline = ${baseline.size})\n`)
  } else if (netNew.length === 0 && cleanedUp.length > 0) {
    process.stdout.write(
      `\naudit-webhook-cast: ${cleanedUp.length} entry/entries cleaned up.\n` +
      `  Run \`npm run audit:webhook-cast -- --update-baseline\` to ratchet DOWN.\n`,
    )
  } else {
    process.stdout.write(
      `\naudit-webhook-cast: ${netNew.length} NET-NEW violation(s).\n` +
      `  Replace \`JSON.parse(body) as <Type>\` with \`<schema>.safeParse(JSON.parse(body))\` + 400 on failure.\n`,
    )
  }
}

if (netNew.length > 0 && !SOFT) process.exit(1)
