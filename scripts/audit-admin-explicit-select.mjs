#!/usr/bin/env node
/**
 * audit-admin-explicit-select.mjs (#1351, epic #1346 — PII pre-launch)
 *
 * `db.X.findMany({ include: { Y: true } })` inside `src/domains/admin/`
 * is a PII over-exposure vector: the entire related row (every column,
 * including phone / email / line2) leaves the server on every list
 * render. Use `include: { Y: { select: { ... } } }` and name the
 * columns the UI actually renders.
 *
 * What this audits:
 *
 *   Every `include: { <relation>: true }` line under `src/domains/admin/`
 *   for the high-PII relations enumerated in `BLOCKED_RELATIONS`.
 *
 * Soft mode (`--soft`) reports without exiting non-zero. CI uses the
 * default hard mode.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src/domains/admin')
const SOFT = process.argv.includes('--soft')

// Relations we KNOW carry PII when loaded as `: true`. Add more as
// new admin queries land. Vendor/Product include can stay unrestricted
// because their public columns are non-personal.
const BLOCKED_RELATIONS = ['address', 'customer', 'user', 'incidents']

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) {
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
  const src = readFileSync(file, 'utf8')
  for (const relation of BLOCKED_RELATIONS) {
    // Match `<relation>: true` after a colon-bare key. Allow
    // whitespace, ignore inside string literals (cheap heuristic:
    // skip lines that look like comments).
    const re = new RegExp(`(^|[\\s{,])${relation}\\s*:\\s*true\\b`, 'gm')
    const lines = src.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Skip line-comments and tests-only context.
      if (/^\s*(\/\/|\*)/.test(line)) continue
      if (re.test(line)) {
        violations.push(`${rel}:${i + 1}  > ${line.trim()}`)
      }
    }
  }
}

if (violations.length > 0) {
  console.log('audit-admin-explicit-select: violations')
  for (const v of violations) {
    console.log(`  [admin-include-bare] ${v}`)
  }
  console.log(
    `\n${violations.length} violation(s). Use \`include: { <rel>: { select: { ... } } }\` and name only the columns the UI renders.`,
  )
  if (!SOFT) process.exit(1)
}

console.log('audit-admin-explicit-select: clean')
