#!/usr/bin/env node
/**
 * audit-prisma-update-spread.mjs
 *
 * Mass-assignment guard. The `prisma.X.update({ data: parsed })` /
 * `data: { ...parsed }` shape blindly forwards every field the parser
 * accepted into the row. As long as the zod schema is strict the
 * forward is safe — but the moment a future PR loosens the schema
 * (`.passthrough()`, an extra optional field, an `unknown` slipped
 * in), privileged columns (`status`, `role`, `vendorId`,
 * `commissionRate`) become writable from the outside without
 * anybody noticing in review.
 *
 * The hardening rule: at the Prisma call site, name every column
 * explicitly. `data: { name: parsed.name, slug: parsed.slug, ... }`
 * is verbose but loud, and a privileged field cannot leak in by
 * accident.
 *
 * What this audits:
 *
 *   Every `<client>.<model>.update(` or `.upsert(` or `.updateMany(`
 *   call in `src/` whose argument list contains a `data:` clause
 *   that consists of a single bare identifier (`data: parsed`) or
 *   that begins with a spread (`data: { ...parsed, ... }`).
 *
 *   Files in ALLOWLIST are exempt — only when the full row IS
 *   intentionally being replaced and the schema is locked down at
 *   a higher layer (e.g. internal jobs that hydrate rows from a
 *   trusted source). Each entry needs a one-line reason.
 *
 * Ratchet mode: same as the other audits.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const BASELINE = join(ROOT, 'scripts', 'audit-prisma-update-spread.baseline.json')
const SOFT = process.argv.includes('--soft')
const JSON_OUT = process.argv.includes('--json')
const ALL = process.argv.includes('--all')
const UPDATE_BASELINE = process.argv.includes('--update-baseline')

const FILE_ALLOWLIST = new Map([
  // Add entries here as `[relativePath, reason]` if a spread is genuinely
  // intentional (full-row replace from a trusted internal source).
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

// Mutating Prisma methods that take a `data:` arg.
const METHOD_RE = /\.(update|updateMany|upsert)\s*\(/g

const violations = []

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file)
  if (FILE_ALLOWLIST.has(rel)) continue
  if (rel.includes('__tests__') || rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue

  const src = readFileSync(file, 'utf8')
  if (!METHOD_RE.test(src)) continue
  METHOD_RE.lastIndex = 0

  let m
  while ((m = METHOD_RE.exec(src)) !== null) {
    const callStart = m.index + m[0].length
    let depth = 1
    let j = callStart
    while (j < src.length && depth > 0) {
      const ch = src[j]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      j++
    }
    const argText = src.slice(callStart, j - 1)

    // Sniff the receiver. `db.X.update`, `tx.X.update`, `prisma.X.update`.
    const before = src.slice(Math.max(0, m.index - 80), m.index)
    const recvMatch = before.match(/(?:db|tx|prisma|client)\.(\w+)$/)
    if (!recvMatch) continue // Not a Prisma model call.

    // Find the `data:` slot. We accept either `data: <expr>` (single
    // expression up to the next top-level `,` or end of arg) or
    // `data: { ... }` (object literal — flag if it starts with `...`).
    const dataIdx = argText.search(/\bdata\s*:/)
    if (dataIdx === -1) continue

    let k = dataIdx + argText.slice(dataIdx).indexOf(':') + 1
    while (k < argText.length && (argText[k] === ' ' || argText[k] === '\t' || argText[k] === '\n' || argText[k] === '\r')) k++

    let badShape = null
    if (argText[k] === '{') {
      // Object literal. Check what's right after the opening brace.
      let l = k + 1
      while (l < argText.length && (argText[l] === ' ' || argText[l] === '\t' || argText[l] === '\n' || argText[l] === '\r')) l++
      if (argText.slice(l, l + 3) === '...') {
        badShape = `data: { ${argText.slice(l, l + 30)}…`
      }
    } else {
      // Bare identifier or some other expression. Slurp until the
      // next top-level `,` or end.
      let l = k
      let d = 0
      let ident = ''
      while (l < argText.length) {
        const ch = argText[l]
        if (ch === '(' || ch === '{' || ch === '[') d++
        else if (ch === ')' || ch === '}' || ch === ']') d--
        else if (ch === ',' && d === 0) break
        ident += ch
        l++
      }
      const trimmed = ident.trim()
      // Bare identifier (no parens, no dots) → flag.
      if (/^[A-Za-z_]\w*$/.test(trimmed)) {
        badShape = `data: ${trimmed}`
      }
    }
    if (!badShape) continue

    const lineNo = src.slice(0, m.index).split('\n').length
    violations.push({
      file: rel,
      line: lineNo,
      model: recvMatch[1],
      excerpt: badShape,
    })
  }
}

function violationKey(v) {
  return `${v.file}|${v.model}|${v.excerpt}`
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
      'Pre-existing prisma update/upsert calls with `data: <ident>` or `data: { ...spread }`. ' +
      'CI tolerates these; new ones fail. Shrink as call sites name fields explicitly.',
    generatedAt: new Date().toISOString(),
    violations: [...currentKeys].sort(),
  }, null, 2) + '\n')
  process.stdout.write(`audit-prisma-update-spread: baseline updated — ${currentKeys.size} entries\n`)
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
    process.stdout.write(`\n[prisma-update-spread] ${v.file}:${v.line} (${v.model})\n`)
    process.stdout.write(`  > ${v.excerpt}\n`)
  }
  if (netNew.length === 0 && cleanedUp.length === 0) {
    process.stdout.write(`\naudit-prisma-update-spread: clean (baseline = ${baseline.size})\n`)
  } else if (netNew.length === 0 && cleanedUp.length > 0) {
    process.stdout.write(
      `\naudit-prisma-update-spread: ${cleanedUp.length} entry/entries cleaned up.\n` +
      `  Run \`npm run audit:prisma-update-spread -- --update-baseline\` to ratchet DOWN.\n`,
    )
  } else {
    process.stdout.write(
      `\naudit-prisma-update-spread: ${netNew.length} NET-NEW violation(s).\n` +
      `  Name each column explicitly: \`data: { name: parsed.name, slug: parsed.slug }\`.\n` +
      `  This stops future schema loosening from leaking privileged fields by accident.\n`,
    )
  }
}

if (netNew.length > 0 && !SOFT) process.exit(1)
