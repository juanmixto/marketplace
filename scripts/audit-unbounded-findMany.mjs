#!/usr/bin/env node
/**
 * audit-unbounded-findMany.mjs
 *
 * Hardens the lesson from DB audit P1.2 (#963). An unbounded
 * `prisma.X.findMany({ where, ... })` server-side is invisible
 * pre-tracción and turns into a TTFB-killer the moment any vendor
 * crosses a few hundred rows. The catalog already has a cursor
 * pattern in src/domains/catalog/queries.ts that the rest of the
 * codebase should mirror.
 *
 * What this audits:
 *
 *   Every `findMany(` call inside src/ that does NOT include any of:
 *     - `take:` (positive limit)
 *     - `cursor:` (the caller is the paginator itself)
 *     - `select: { _count: ... }` patterns (count-only, harmless)
 *   ...is flagged unless the file is in ALLOWLIST.
 *
 * The allowlist exists because some callers genuinely need every
 * row — aggregations, full-table exports, KPI computations over the
 * vendor's entire catalog. Each allowlisted file MUST come with a
 * one-line reason.
 *
 * Ratchet mode: like audit-fk-onDelete.mjs, the script tolerates
 * pre-existing violations recorded in the baseline file and only
 * fails on net-new ones. Run with --update-baseline after a cleanup
 * to shrink the baseline; CI never grows it.
 *
 * Usage:
 *   node scripts/audit-unbounded-findMany.mjs                     # CI mode
 *   node scripts/audit-unbounded-findMany.mjs --json
 *   node scripts/audit-unbounded-findMany.mjs --soft
 *   node scripts/audit-unbounded-findMany.mjs --all               # full report
 *   node scripts/audit-unbounded-findMany.mjs --update-baseline
 *
 * Exit codes:
 *   0 — no net-new violations
 *   1 — net-new violations found
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const BASELINE = join(ROOT, 'scripts', 'audit-unbounded-findMany.baseline.json')
const SOFT = process.argv.includes('--soft')
const JSON_OUT = process.argv.includes('--json')
const ALL = process.argv.includes('--all')
const UPDATE_BASELINE = process.argv.includes('--update-baseline')

// Files where an unbounded findMany is intentional. Each entry MUST
// have a one-line reason, justifying why every row is genuinely
// needed. Common legitimate cases:
//   - Aggregations / KPI computations
//   - Server-side dropdowns where the full population is small and
//     bounded by another constraint (e.g. a vendor's own categories)
//   - Background workers that operate on all rows by design
//   - Sitemap / SEO generators
const FILE_ALLOWLIST = new Map([
  // Background workers and sync jobs need to walk the full set.
  ['src/domains/ingestion/telegram/jobs/sync.ts',          'sync worker walks entire chat history'],
  ['src/domains/ingestion/processing/dedupe/scanner.ts',   'dedupe scans all extraction results'],
  ['src/domains/ingestion/processing/drafts/builder.ts',   'extractor walks pending messages'],

  // KPI / aggregate computations. These hydrate every row to compute
  // a sum / count that cannot be pushed to a single SQL aggregate.
  ['src/domains/admin-stats/queries.ts',                   'admin-only KPI aggregations'],
  ['src/domains/admin/reports.ts',                         'admin-only KPI aggregations'],

  // Sitemap / SEO need to enumerate every public entity.
  ['src/app/sitemap.ts',                                   'sitemap enumerates every public entity'],
  ['src/app/sitemap-products/route.ts',                    'sitemap chunk for products'],
  ['src/app/sitemap-vendors/route.ts',                     'sitemap chunk for vendors'],

  // Settlement runs over a vendor's full month. Bounded by date filter.
  ['src/domains/payments/settle.ts',                       'settlement period is bounded by date filter'],
  ['src/domains/payments/reconcile.ts',                    'reconcile walks the unprocessed webhook tail'],
])

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) {
      // Skip generated Prisma client.
      if (p.includes('/generated/')) continue
      out.push(...walk(p))
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(p)
    }
  }
  return out
}

const violations = []

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file)
  if (FILE_ALLOWLIST.has(rel)) continue
  // Test files inside src/ (rare, but skip them defensively).
  if (rel.includes('__tests__') || rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue

  const src = readFileSync(file, 'utf8')
  // Quick rejection: no findMany at all.
  if (!src.includes('.findMany(')) continue

  // Walk every `.findMany(` occurrence and slurp until the matching
  // closing `)`. Treats `{...}` as opaque depth markers — good enough
  // for the call-site styles this codebase uses.
  let i = 0
  while (true) {
    const idx = src.indexOf('.findMany(', i)
    if (idx === -1) break
    const start = idx + '.findMany('.length
    let depth = 1
    let j = start
    while (j < src.length && depth > 0) {
      const ch = src[j]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      j++
    }
    const argText = src.slice(start, j - 1)
    i = j

    const hasTake = /\btake\s*:/.test(argText)
    const hasCursor = /\bcursor\s*:/.test(argText)
    // _count selects are harmless: they don't hydrate rows.
    const isCountOnly = /\bselect\s*:\s*\{\s*_count\b/.test(argText)
    if (hasTake || hasCursor || isCountOnly) continue

    // Compute line number of the offending call.
    const lineNo = src.slice(0, idx).split('\n').length
    // Identify the model: scan backwards from the call site for an
    // identifier after `db.` or `tx.` or `prisma.`.
    const before = src.slice(Math.max(0, idx - 80), idx)
    const modelMatch = before.match(/(?:db|tx|prisma)\.(\w+)$/)
    violations.push({
      file: rel,
      line: lineNo,
      model: modelMatch ? modelMatch[1] : '?',
      excerpt: src.slice(idx, Math.min(src.length, j)).split('\n')[0].trim(),
    })
  }
}

function violationKey(v) {
  return `${v.file}|${v.model}`
}

function loadBaseline() {
  if (!existsSync(BASELINE)) return new Set()
  try {
    const raw = JSON.parse(readFileSync(BASELINE, 'utf8'))
    return new Set(raw.violations || [])
  } catch {
    return new Set()
  }
}

const baseline = loadBaseline()
const currentKeys = new Set(violations.map(violationKey))
const netNew = violations.filter((v) => !baseline.has(violationKey(v)))
const cleanedUp = [...baseline].filter((k) => !currentKeys.has(k))

if (UPDATE_BASELINE) {
  const nextBaseline = {
    note:
      'Pre-existing unbounded findMany() calls. CI tolerates these; new ones fail. ' +
      'Shrink this file as call sites adopt cursor pagination — never grow it.',
    generatedAt: new Date().toISOString(),
    violations: [...currentKeys].sort(),
  }
  writeFileSync(BASELINE, JSON.stringify(nextBaseline, null, 2) + '\n')
  process.stdout.write(
    `audit-unbounded-findMany: baseline updated — ${currentKeys.size} entries\n`,
  )
  process.exit(0)
}

if (JSON_OUT) {
  process.stdout.write(
    JSON.stringify(
      {
        violations: ALL ? violations : netNew,
        netNewCount: netNew.length,
        baselineSize: baseline.size,
        cleanedUpCount: cleanedUp.length,
      },
      null,
      2,
    ) + '\n',
  )
} else {
  const toReport = ALL ? violations : netNew
  for (const v of toReport) {
    process.stdout.write(`\n[unbounded-findMany] ${v.file}:${v.line}\n`)
    process.stdout.write(`  model: ${v.model}\n`)
    process.stdout.write(`  > ${v.excerpt}\n`)
  }
  if (netNew.length === 0 && cleanedUp.length === 0) {
    process.stdout.write(
      `\naudit-unbounded-findMany: clean (baseline = ${baseline.size}, no net-new)\n`,
    )
  } else if (netNew.length === 0 && cleanedUp.length > 0) {
    process.stdout.write(
      `\naudit-unbounded-findMany: ${cleanedUp.length} entry/entries cleaned up since baseline.\n` +
        `  Run \`npm run audit:findMany -- --update-baseline\` to ratchet the baseline DOWN.\n`,
    )
  } else {
    process.stdout.write(
      `\naudit-unbounded-findMany: ${netNew.length} NET-NEW violation(s).\n` +
        `  Total in src: ${violations.length} (baseline tolerates ${baseline.size}).\n` +
        `  Add a take/cursor — see src/domains/catalog/queries.ts for the canonical pattern.\n` +
        `  If every row is genuinely needed (KPI / sitemap / worker), add the file to FILE_ALLOWLIST in this script with a one-line reason.\n`,
    )
  }
}

if (netNew.length > 0 && !SOFT) process.exit(1)
