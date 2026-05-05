#!/usr/bin/env node
/**
 * audit-status-write.mjs
 *
 * Ratchet guard for the state-machine hardening plan (#1330 / Block 6).
 * Direct writes to `status` on Order / Payment / Settlement /
 * VendorFulfillment are only supposed to happen in the dedicated
 * state-machine modules (or the Stripe webhook shim that already owns
 * the transition contract). Anywhere else, a direct `status` write is
 * a new bypass path around the transition rules.
 *
 * What this audits:
 *
 *   Every `db|tx|prisma|client.(order|payment|settlement|vendorFulfillment)`
 *   `.update*({ ... data: { ... status: ... } })` in `src/` is a
 *   violation unless the file is allowlisted below.
 *
 * Allowlist:
 *   - any `state-machine.ts` under `src/domains/<name>/`
 *   - `src/domains/payments/webhook.ts`
 *
 * Ratchet mode: existing violations live in the baseline file so CI only
 * fails on net-new ones. Run with `--update-baseline` to shrink the
 * baseline once call sites move to `state-machine.ts`.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const BASELINE = join(ROOT, 'scripts', 'audit-status-write.baseline.json')
const SOFT = process.argv.includes('--soft')
const JSON_OUT = process.argv.includes('--json')
const ALL = process.argv.includes('--all')
const UPDATE_BASELINE = process.argv.includes('--update-baseline')

const MODEL_RE = /\.(order|payment|settlement|vendorFulfillment)\.(update|updateMany|upsert)\s*\(/g
const ALLOWED_EXACT = new Set([
  'src/domains/payments/webhook.ts',
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

function isAllowlisted(rel) {
  if (ALLOWED_EXACT.has(rel)) return true
  return /src\/domains\/.*\/state-machine\.ts$/.test(rel)
}

function findMatchingParen(src, openIdx) {
  let depth = 0
  let i = openIdx
  let inString = null
  let escaped = false
  while (i < src.length) {
    const ch = src[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === inString) {
        inString = null
      }
      i++
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      inString = ch
      i++
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return -1
}

function findMatchingBrace(src, openIdx) {
  let depth = 0
  let i = openIdx
  let inString = null
  let escaped = false
  let inLineComment = false
  let inBlockComment = false
  while (i < src.length) {
    const ch = src[i]
    const next = src[i + 1]
    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      i++
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i += 2
        continue
      }
      i++
      continue
    }
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === inString) {
        inString = null
      }
      i++
      continue
    }
    if (ch === '/' && next === '/') {
      inLineComment = true
      i += 2
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i += 2
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      inString = ch
      i++
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return -1
}

function hasTopLevelProperty(objectText, propertyName) {
  let depth = 0
  let i = 0
  let inString = null
  let escaped = false
  let inLineComment = false
  let inBlockComment = false
  while (i < objectText.length) {
    const ch = objectText[i]
    const next = objectText[i + 1]
    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      i++
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i += 2
        continue
      }
      i++
      continue
    }
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === inString) {
        inString = null
      }
      i++
      continue
    }
    if (ch === '/' && next === '/') {
      inLineComment = true
      i += 2
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i += 2
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      inString = ch
      i++
      continue
    }
    if (ch === '{') {
      depth++
      i++
      continue
    }
    if (ch === '}') {
      depth--
      i++
      continue
    }

    if (depth === 1 && /[A-Za-z_$]/.test(ch)) {
      let j = i + 1
      while (j < objectText.length && /[A-Za-z0-9_$]/.test(objectText[j])) j++
      const ident = objectText.slice(i, j)
      if (ident === propertyName) {
        let k = j
        while (k < objectText.length && /\s/.test(objectText[k])) k++
        if (objectText[k] === ':') return true
      }
      i = j
      continue
    }

    i++
  }
  return false
}

function extractStatusExcerpt(objectText) {
  const compact = objectText.replace(/\s+/g, ' ').trim()
  return compact.length > 120 ? `${compact.slice(0, 120)}…` : compact
}

const violations = []

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file)
  if (isAllowlisted(rel)) continue
  if (rel.includes('__tests__') || rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue

  const src = readFileSync(file, 'utf8')
  if (!MODEL_RE.test(src)) continue
  MODEL_RE.lastIndex = 0

  let m
  while ((m = MODEL_RE.exec(src)) !== null) {
    const callStart = m.index + m[0].length
    const callEnd = findMatchingParen(src, callStart - 1)
    if (callEnd === -1) continue

    const argText = src.slice(callStart, callEnd)
    const dataIdx = argText.search(/\bdata\s*:/)
    if (dataIdx === -1) continue

    let k = dataIdx + argText.slice(dataIdx).indexOf(':') + 1
    while (k < argText.length && /\s/.test(argText[k])) k++
    if (argText[k] !== '{') continue

    const objectEnd = findMatchingBrace(argText, k)
    if (objectEnd === -1) continue
    const objectText = argText.slice(k, objectEnd + 1)

    if (!hasTopLevelProperty(objectText, 'status')) continue

    const lineNo = src.slice(0, m.index).split('\n').length
    violations.push({
      file: rel,
      line: lineNo,
      model: m[1],
      excerpt: `data: ${extractStatusExcerpt(objectText)}`,
    })
  }
}

function violationKey(v) {
  return `${v.file}|${v.model}|${v.excerpt}`
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
  writeFileSync(
    BASELINE,
    JSON.stringify({
      note:
        'Pre-existing direct status writes to Order/Payment/Settlement/VendorFulfillment. ' +
        'CI tolerates these; new ones fail. Shrink this file as call sites move behind state-machine wrappers.',
      generatedAt: new Date().toISOString(),
      violations: [...currentKeys].sort(),
    }, null, 2) + '\n',
  )
  process.stdout.write(`audit-status-write: baseline updated — ${currentKeys.size} entries\n`)
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
    process.stdout.write(`\n[status-write] ${v.file}:${v.line} (${v.model})\n`)
    process.stdout.write(`  > ${v.excerpt}\n`)
  }
  if (netNew.length === 0 && cleanedUp.length === 0) {
    process.stdout.write(`\naudit-status-write: clean (baseline = ${baseline.size})\n`)
  } else if (netNew.length === 0 && cleanedUp.length > 0) {
    process.stdout.write(
      `\naudit-status-write: ${cleanedUp.length} entry/entries cleaned up.\n` +
      `  Run \`npm run audit:status-write -- --update-baseline\` to ratchet DOWN.\n`,
    )
  } else {
    process.stdout.write(
      `\naudit-status-write: ${netNew.length} NET-NEW violation(s).\n` +
      `  Move status transitions behind the state-machine wrappers; direct status writes are no longer allowed.\n`,
    )
  }
}

if (netNew.length > 0 && !SOFT) process.exit(1)
