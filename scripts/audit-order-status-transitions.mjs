#!/usr/bin/env node
/**
 * audit-order-status-transitions.mjs
 *
 * Hardens the lesson from #1342. Every server-side write that sets
 * `Order.status` MUST be preceded by a static call to
 * `assertOrderTransition(from, to)` so the FSM declared in
 * `src/domains/orders/state-machine.ts` is the single source of truth
 * for legal transitions.
 *
 * What this audits:
 *
 *   Every `prisma.order.update*` / `tx.order.update*` / `db.order.update*`
 *   call inside src/ whose `data` object contains a `status:` field
 *   must have a call to `assertOrderTransition` within the ~10 lines
 *   immediately before the call.
 *
 * Ratchet mode: like audit-fk-onDelete.mjs and audit-unbounded-findMany.mjs,
 * the script tolerates pre-existing violations recorded in the
 * baseline file and only fails on net-new ones. CI never grows it.
 *
 * Usage:
 *   node scripts/audit-order-status-transitions.mjs
 *   node scripts/audit-order-status-transitions.mjs --json
 *   node scripts/audit-order-status-transitions.mjs --soft
 *   node scripts/audit-order-status-transitions.mjs --all
 *   node scripts/audit-order-status-transitions.mjs --update-baseline
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const BASELINE = join(ROOT, 'scripts', 'audit-order-status-transitions.baseline.json')
const SOFT = process.argv.includes('--soft')
const JSON_OUT = process.argv.includes('--json')
const ALL = process.argv.includes('--all')
const UPDATE_BASELINE = process.argv.includes('--update-baseline')

const LOOKBACK_LINES = 30

// Files whose `order.update*` calls are exempt. Add a one-line reason.
const FILE_ALLOWLIST = new Map([
  // The state machine source itself (no Prisma calls there today, but
  // future helpers might write to verify themselves in tests).
  ['src/domains/orders/state-machine.ts', 'declares the FSM'],
])

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (p.includes('/generated/')) continue
      out.push(...walk(p))
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(p)
    }
  }
  return out
}

const CALL_RE = /\b(?:prisma|tx|db)\.order\.(update|updateMany|upsert)\s*\(/g

const violations = []

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file)
  if (FILE_ALLOWLIST.has(rel)) continue
  if (rel.includes('__tests__') || rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue

  const src = readFileSync(file, 'utf8')
  if (!/\.order\.(update|updateMany|upsert)\s*\(/.test(src)) continue

  for (const match of src.matchAll(CALL_RE)) {
    const callIdx = match.index
    if (callIdx === undefined) continue
    const openParen = callIdx + match[0].length - 1
    let depth = 1
    let j = openParen + 1
    while (j < src.length && depth > 0) {
      const ch = src[j]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      j++
    }
    const argText = src.slice(openParen + 1, j - 1)

    // Skip calls without a status: write in the data object.
    const dataMatch = argText.match(/\bdata\s*:\s*\{([\s\S]*)$/)
    if (!dataMatch) continue
    if (!/\bstatus\s*:/.test(dataMatch[1])) continue

    // Look back LOOKBACK_LINES lines for assertOrderTransition.
    const lineStart = src.slice(0, callIdx).split('\n').length
    const startLine = Math.max(0, lineStart - LOOKBACK_LINES)
    const lines = src.split('\n')
    const window = lines.slice(startLine, lineStart).join('\n')
    if (window.includes('assertOrderTransition')) continue

    violations.push({
      file: rel,
      line: lineStart,
      excerpt: lines[lineStart - 1]?.trim() ?? '',
    })
  }
}

function violationKey(v) {
  return `${v.file}:${v.line}`
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
const netNew = violations.filter(v => !baseline.has(violationKey(v)))
const cleanedUp = [...baseline].filter(k => !currentKeys.has(k))

if (UPDATE_BASELINE) {
  const nextBaseline = {
    note:
      'Pre-existing order.update*({ data: { status: ... }}) calls without a preceding assertOrderTransition. ' +
      'CI tolerates these; new ones fail. Shrink this file as call sites adopt the guard — never grow it.',
    generatedAt: new Date().toISOString(),
    violations: [...currentKeys].sort(),
  }
  writeFileSync(BASELINE, JSON.stringify(nextBaseline, null, 2) + '\n')
  process.stdout.write(
    `audit-order-status-transitions: baseline updated — ${currentKeys.size} entries\n`,
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
    process.stdout.write(`\n[order-status-transitions] ${v.file}:${v.line}\n`)
    process.stdout.write(`  > ${v.excerpt}\n`)
  }
  if (netNew.length === 0 && cleanedUp.length === 0) {
    process.stdout.write(
      `\naudit-order-status-transitions: clean (baseline = ${baseline.size}, no net-new)\n`,
    )
  } else if (netNew.length === 0 && cleanedUp.length > 0) {
    process.stdout.write(
      `\naudit-order-status-transitions: ${cleanedUp.length} entry/entries cleaned up since baseline.\n` +
        `  Run \`node scripts/audit-order-status-transitions.mjs --update-baseline\` to ratchet DOWN.\n`,
    )
  } else {
    process.stdout.write(
      `\naudit-order-status-transitions: ${netNew.length} NET-NEW violation(s).\n` +
        `  Total in src: ${violations.length} (baseline tolerates ${baseline.size}).\n` +
        `  Add an assertOrderTransition(from, to) call before the prisma.order.update*({ data: { status: ... } }).\n` +
        `  See src/domains/orders/state-machine.ts for the declarative table.\n`,
    )
  }
}

if (netNew.length > 0 && !SOFT) process.exit(1)
