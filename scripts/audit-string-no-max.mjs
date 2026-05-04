#!/usr/bin/env node
/**
 * audit-string-no-max.mjs
 *
 * Hardens the lesson from #1160 / #1177. Every `z.string()` declared in
 * a server-facing schema needs an explicit upper bound — without
 * `.max(N)` you ship a free-text channel that an attacker can pump
 * arbitrarily large strings into (DoS, log spam, DB row bloat). The
 * `verify-email` token in #1165 was exactly this: a query param that
 * landed in a Prisma lookup with no length cap.
 *
 * What this audits:
 *
 *   Every `z.string()` occurrence in `src/` whose call-chain does NOT
 *   include any of the bounding qualifiers below is a violation:
 *     - `.max(...)` — explicit cap (preferred)
 *     - `.length(...)` — exact length (e.g. cuid)
 *     - `.email()` — RFC-bounded by zod (254)
 *     - `.url()`, `.cuid()`, `.cuid2()`, `.uuid()`, `.ulid()`, `.datetime()`,
 *       `.date()`, `.time()`, `.ip()` — bounded shapes
 *     - `.regex(...)` — caller's regex defines the bound
 *
 *   Plus an opt-out: a same-line trailing `// allow:unbounded`
 *   comment, for the rare cases where a string is genuinely
 *   length-free (e.g. an internal correlation id that's already
 *   bounded upstream). Each opt-out should also note WHY in the
 *   surrounding code.
 *
 * Ratchet mode: like the other audits, the script tolerates
 * pre-existing violations recorded in the baseline file and only
 * fails on net-new ones. Run with --update-baseline after a cleanup
 * to shrink the baseline; CI never grows it.
 *
 * Usage:
 *   node scripts/audit-string-no-max.mjs                     # CI mode
 *   node scripts/audit-string-no-max.mjs --json
 *   node scripts/audit-string-no-max.mjs --soft
 *   node scripts/audit-string-no-max.mjs --all
 *   node scripts/audit-string-no-max.mjs --update-baseline
 *
 * Exit codes:
 *   0 — no net-new violations
 *   1 — net-new violations found
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const BASELINE = join(ROOT, 'scripts', 'audit-string-no-max.baseline.json')
const SOFT = process.argv.includes('--soft')
const JSON_OUT = process.argv.includes('--json')
const ALL = process.argv.includes('--all')
const UPDATE_BASELINE = process.argv.includes('--update-baseline')

// Method calls that, by themselves, bound the string. If any of these
// appears in the chain after `z.string()` we accept the call as bounded.
const BOUNDING_METHODS = new Set([
  'max',
  'length',
  'email',
  'url',
  'cuid',
  'cuid2',
  'uuid',
  'ulid',
  'datetime',
  'date',
  'time',
  'ip',
  'regex',
])

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (p.includes('/generated/') || p.includes('/node_modules/')) continue
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
  if (rel.includes('__tests__') || rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue

  const src = readFileSync(file, 'utf8')
  if (!src.includes('z.string()')) continue

  let i = 0
  while (true) {
    const idx = src.indexOf('z.string()', i)
    if (idx === -1) break
    i = idx + 'z.string()'.length

    // Slurp the chain after `z.string()` — every `.method(...)` until
    // we hit something that breaks the call expression (newline outside
    // a paren, comma at depth 0, semicolon, closing paren at depth 0,
    // or the end of file). Treat parens as opaque depth markers.
    let j = i
    let depth = 0
    let chainEnd = j
    while (j < src.length) {
      const ch = src[j]
      if (ch === '(') depth++
      else if (ch === ')') {
        if (depth === 0) break
        depth--
      } else if (depth === 0) {
        if (ch === ',' || ch === ';' || ch === '}' || ch === ']') break
        if (ch === '\n') {
          // Continue across a newline only if the next non-whitespace
          // char is `.` (continued chain) or `)` (end of arg).
          let k = j + 1
          while (k < src.length && (src[k] === ' ' || src[k] === '\t' || src[k] === '\r')) k++
          if (src[k] !== '.' && src[k] !== ')') break
        }
      }
      j++
      chainEnd = j
    }
    const chain = src.slice(idx, chainEnd)

    // Same-line opt-out comment.
    const lineEnd = src.indexOf('\n', idx)
    const lineSlice = src.slice(idx, lineEnd === -1 ? src.length : lineEnd)
    if (/\/\/\s*allow:unbounded\b/.test(lineSlice)) continue

    // Look for any bounding method anywhere in the chain. We only check
    // the method NAMES so a `.max(0)` written badly still counts; that's
    // a separate concern.
    const methodRegex = /\.(\w+)\s*\(/g
    let m
    let bounded = false
    while ((m = methodRegex.exec(chain)) !== null) {
      if (BOUNDING_METHODS.has(m[1])) { bounded = true; break }
    }
    if (bounded) continue

    const lineNo = src.slice(0, idx).split('\n').length
    violations.push({
      file: rel,
      line: lineNo,
      excerpt: lineSlice.trim(),
    })
  }
}

function violationKey(v) {
  // Line number deliberately excluded — drifts on unrelated edits.
  return `${v.file}|${v.excerpt}`
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
      'Pre-existing z.string() declarations without an explicit length bound. ' +
      'CI tolerates these; new ones fail the build. Shrink this file as the ' +
      'codebase adopts .max() — never grow it.',
    generatedAt: new Date().toISOString(),
    violations: [...currentKeys].sort(),
  }
  writeFileSync(BASELINE, JSON.stringify(nextBaseline, null, 2) + '\n')
  process.stdout.write(`audit-string-no-max: baseline updated — ${currentKeys.size} entries\n`)
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
  const toReport = ALL ? violations : netNew
  for (const v of toReport) {
    process.stdout.write(`\n[string-no-max] ${v.file}:${v.line}\n`)
    process.stdout.write(`  > ${v.excerpt}\n`)
  }
  if (netNew.length === 0 && cleanedUp.length === 0) {
    process.stdout.write(`\naudit-string-no-max: clean (baseline = ${baseline.size}, no net-new violations)\n`)
  } else if (netNew.length === 0 && cleanedUp.length > 0) {
    process.stdout.write(
      `\naudit-string-no-max: ${cleanedUp.length} entry/entries cleaned up.\n` +
      `  Run \`npm run audit:string-no-max -- --update-baseline\` to ratchet DOWN.\n`,
    )
  } else {
    process.stdout.write(
      `\naudit-string-no-max: ${netNew.length} NET-NEW violation(s).\n` +
      `  Total: ${violations.length} (baseline tolerates ${baseline.size}).\n` +
      `  Add .max(N), or — if genuinely unbounded — append a // allow:unbounded comment with a reason.\n`,
    )
  }
}

if (netNew.length > 0 && !SOFT) process.exit(1)
