#!/usr/bin/env node
/**
 * audit-form-number-coerce.mjs
 *
 * Hardens HU3 of #1160. The ad-hoc shape
 *   const price = Number(formData.get('price'))
 *   const amount = parseFloat(formData.get('amount'))
 *   const stock = parseInt(formData.get('stock'), 10)
 * silently produces NaN on any unparseable input, and downstream
 * `>` / `<` comparisons against NaN are all false — which means a
 * malformed input falls through every numeric guard and lands in the
 * DB as a Decimal NaN (or, more often, a 500 from Prisma's runtime
 * type check). The marketplace standard since #1177 is to send the
 * raw string into a zod schema and let `zMoneyEUR` (or
 * `z.coerce.number().finite()` + bounds) reject it cleanly.
 *
 * What this audits:
 *
 *   Every `Number(formData.get(...))`, `parseFloat(formData.get(...))`,
 *   `parseInt(formData.get(...), ...)` occurrence anywhere in `src/`.
 *   `Number()` and `parse*()` against any other source are out of
 *   scope — only the form-data path is the one that #1166 fixed.
 *
 * Ratchet mode: same as the other audits.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const BASELINE = join(ROOT, 'scripts', 'audit-form-number-coerce.baseline.json')
const SOFT = process.argv.includes('--soft')
const JSON_OUT = process.argv.includes('--json')
const ALL = process.argv.includes('--all')
const UPDATE_BASELINE = process.argv.includes('--update-baseline')

// `Number(formData.get(...))`, `parseFloat(formData.get(...))`,
// `parseInt(formData.get(...), ...)`. The capture group is the
// numeric coercer for diagnostics.
const PATTERNS = [
  /\bNumber\s*\(\s*formData\.get\(/g,
  /\bparseFloat\s*\(\s*formData\.get\(/g,
  /\bparseInt\s*\(\s*formData\.get\(/g,
]

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

  for (const re of PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(src)) !== null) {
      const lineNo = src.slice(0, m.index).split('\n').length
      const lineEnd = src.indexOf('\n', m.index)
      const lineSlice = src.slice(m.index, lineEnd === -1 ? src.length : lineEnd)
      violations.push({
        file: rel,
        line: lineNo,
        excerpt: lineSlice.trim().slice(0, 160),
      })
    }
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
      'Pre-existing Number()/parseFloat()/parseInt() of formData.get(...) — these bypass ' +
      'zod coercion and silently produce NaN. CI tolerates the listed ones; new ones fail. ' +
      'Replace with a zod schema that takes the string and applies zMoneyEUR / z.coerce.number().finite().',
    generatedAt: new Date().toISOString(),
    violations: [...currentKeys].sort(),
  }, null, 2) + '\n')
  process.stdout.write(`audit-form-number-coerce: baseline updated — ${currentKeys.size} entries\n`)
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
    process.stdout.write(`\n[form-number-coerce] ${v.file}:${v.line}\n`)
    process.stdout.write(`  > ${v.excerpt}\n`)
  }
  if (netNew.length === 0 && cleanedUp.length === 0) {
    process.stdout.write(`\naudit-form-number-coerce: clean (baseline = ${baseline.size})\n`)
  } else if (netNew.length === 0 && cleanedUp.length > 0) {
    process.stdout.write(
      `\naudit-form-number-coerce: ${cleanedUp.length} entry/entries cleaned up.\n` +
      `  Run \`npm run audit:form-number-coerce -- --update-baseline\` to ratchet DOWN.\n`,
    )
  } else {
    process.stdout.write(
      `\naudit-form-number-coerce: ${netNew.length} NET-NEW violation(s).\n` +
      `  Pass the raw string to a zod schema (zMoneyEUR / z.coerce.number().finite()) so NaN is rejected explicitly.\n`,
    )
  }
}

if (netNew.length > 0 && !SOFT) process.exit(1)
